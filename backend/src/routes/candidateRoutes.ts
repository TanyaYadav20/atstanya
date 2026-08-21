import { Router } from "express";
import upload from "../middleware/upload";

import Candidate from "../models/Candidate";
import Job from "../models/Job";

import { candidateSchema } from "../validators/candidateValidator";
import { parseResume } from "../utils/resumeParser";
import { generateFileHash } from "../utils/fileHash";

import { analyzeCandidate, type AIAnalysis } from "../services/gemini.service";
import {
  matchOrCreateCandidate,
  type CandidateIdentity,
} from "../services/candidateMatching.service";
import {
  createOrUpdateApplication,
  getApplicationByCandidateAndJob,
} from "../services/application.service";
import { findOrCreateResume } from "../services/resume.service";

const router = Router();

// ============================================================
// CANDIDATE APPLY - SINGLE RESUME
// ============================================================

router.post("/apply", upload.single("resume"), async (req, res, next) => {
  try {
    // ------------------------------------------------------
    // 1. Check resume
    // ------------------------------------------------------

    if (!req.file) {
      return res.status(400).json({
        message: "Resume is required",
      });
    }

    // ------------------------------------------------------
    // 2. Validate submitted candidate details.
    //
    // These are NOT the source of truth for candidate identity
    // (see step 6) — they're a fallback used only if AI
    // extraction is unavailable or comes back empty, and jobId
    // is required regardless.
    // ------------------------------------------------------

    const { error, value } = candidateSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message,
      });
    }

    const {
      name: formName,
      email: formEmail,
      phone: formPhone,
      totalExperienceYears: formExperience,
      jobId,
    } = value;

    // ------------------------------------------------------
    // 3. Find job
    // ------------------------------------------------------

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    // ------------------------------------------------------
    // 4. Generate SHA-256 hash.
    //
    // Used ONLY for exact-file resume deduplication (step 9).
    // Never used to resolve candidate identity.
    // ------------------------------------------------------

    const resumeHash = generateFileHash(req.file.path);

    // ------------------------------------------------------
    // 5. Parse resume
    // ------------------------------------------------------

    const resumeText = await parseResume(req.file.path);

    // ------------------------------------------------------
    // 6. Gemini extracts candidate identity + evaluates fit
    //    against the job. Kept in its own try/catch: if the AI
    //    call fails, the application can still be submitted
    //    (using the form-submitted fallback identity below)
    //    rather than blocking the candidate entirely.
    // ------------------------------------------------------

    let aiAnalysis: AIAnalysis | null = null;
    let aiFailed = false;

    try {
      aiAnalysis = await analyzeCandidate(job, resumeText);
    } catch (aiError) {
      console.error("AI analysis failed:", aiError);
      aiFailed = true;
    }

    // ------------------------------------------------------
    // 7. Candidate identity: prefer what Gemini extracted from
    // the resume itself (the same source /upload-resume uses,
    // so both routes match consistently); fall back to the
    // submitted form fields only where extraction is missing.
    // ------------------------------------------------------

    const identity: CandidateIdentity & {
      email: string;
      totalExperienceYears: number;
    } = {
      name: aiAnalysis?.candidate.name || formName,
      phone: aiAnalysis?.candidate.phone || formPhone,
      email: aiAnalysis?.candidate.email || formEmail,
      linkedinUrl: aiAnalysis?.candidate.linkedinUrl,
      githubUrl: aiAnalysis?.candidate.githubUrl,
      totalExperienceYears:
        aiAnalysis?.candidate.totalExperienceYears ?? formExperience,
    };

    // ------------------------------------------------------
    // 8. Confidence-based candidate matching. This is the ONLY
    // place candidate identity is decided — HIGH resolves to the
    // existing candidate, REVIEW creates a new candidate flagged
    // as a possible duplicate (never silently merged), NEW
    // creates a fresh candidate.
    // ------------------------------------------------------

    const match = await matchOrCreateCandidate(identity);
    const candidate = match.candidate;

    // ------------------------------------------------------
    // 9. Create/find Resume, scoped to this job + resolved
    // candidate (jobId + resumeHash — see models/Resume.ts).
    // ------------------------------------------------------

    const { resume } = await findOrCreateResume({
      candidateId: candidate._id,
      jobId: job._id,
      resumeHash,
      filePath: req.file.path,
      resumeText,
      aiAnalysis,
    });

    // ------------------------------------------------------
    // 10. Create or update the Application for
    // candidateId + jobId. If AI analysis failed on this
    // request and an Application already exists (a resubmission
    // for the same job), preserve its previous analysis instead
    // of overwriting it with nothing.
    // ------------------------------------------------------

    let applicationAnalysis: AIAnalysis | null = aiAnalysis;

    if (aiFailed) {
      const existingApplication = await getApplicationByCandidateAndJob(
        candidate._id,
        job._id
      );

      applicationAnalysis =
        (existingApplication?.aiAnalysis as AIAnalysis | undefined) ?? null;
    }

    const result = await createOrUpdateApplication({
      candidateId: candidate._id,
      jobId: job._id,
      resumeId: resume._id,
      aiAnalysis: applicationAnalysis,
    });

    // ------------------------------------------------------
    // 11. Response
    // ------------------------------------------------------

    if (aiFailed) {
      return res.status(201).json({
        message: "Application submitted, but AI analysis failed",
        candidate,
        resume,
        application: result.application,
      });
    }

    return res.status(result.created ? 201 : 200).json({
      message: result.created
        ? "Application submitted and analyzed successfully"
        : "Existing application updated with new resume and AI analysis",

      candidate,
      resume,
      application: result.application,
      aiAnalysis,

      matching: {
        status: match.status,
        confidenceScore: match.confidenceScore,
        matchedFields: match.matchedFields,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// RECRUITER UPLOAD MULTIPLE RESUMES
// ============================================================

router.post(
  "/upload-resume",
  upload.array("resumes", 20),
  async (req, res, next) => {
    try {
      const files = req.files as Express.Multer.File[];

      console.log("Resume files received:", files?.length ?? 0);

      const { jobId } = req.body;

      // ------------------------------------------------------
      // 1. Validate Job ID
      // ------------------------------------------------------

      if (!jobId) {
        return res.status(400).json({
          message: "Job ID is required",
        });
      }

      // ------------------------------------------------------
      // 2. Find job
      // ------------------------------------------------------

      const job = await Job.findById(jobId);

      if (!job) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      // ------------------------------------------------------
      // 3. Validate files
      // ------------------------------------------------------

      if (!files || files.length === 0) {
        return res.status(400).json({
          message: "Please upload at least one resume",
        });
      }

      const extractedResumes: any[] = [];

      // ------------------------------------------------------
      // 4. Process each resume
      // ------------------------------------------------------

      for (const file of files) {
        try {
          // --------------------------------------------------
          // 4.1 Generate hash — exact-file dedup only.
          // --------------------------------------------------

          const resumeHash = generateFileHash(file.path);

          // --------------------------------------------------
          // 4.2 Parse resume
          // --------------------------------------------------

          const resumeText = await parseResume(file.path);

          console.log(`Processing: ${file.originalname}`);

          // --------------------------------------------------
          // 4.3 Gemini extracts identity + evaluates fit
          // --------------------------------------------------

          const aiAnalysis = await analyzeCandidate(job, resumeText);

          console.log(
            `AI score for ${file.originalname}:`,
            aiAnalysis.overallMatchScore
          );

          // --------------------------------------------------
          // 4.4 Confidence-based candidate matching — the only
          // place identity is decided for this file.
          // --------------------------------------------------

          const identity: CandidateIdentity & {
            email: string;
            totalExperienceYears: number;
          } = {
            name: aiAnalysis.candidate.name,
            phone: aiAnalysis.candidate.phone,
            email: aiAnalysis.candidate.email,
            linkedinUrl: aiAnalysis.candidate.linkedinUrl,
            githubUrl: aiAnalysis.candidate.githubUrl,
            totalExperienceYears: aiAnalysis.candidate.totalExperienceYears,
          };

          const match = await matchOrCreateCandidate(identity);
          const candidate = match.candidate;

          console.log(
            `Candidate match for ${file.originalname}:`,
            match.status,
            match.confidenceScore
          );

          // --------------------------------------------------
          // 4.5 Create/find Resume in this job's Resume Pool
          // (jobId + resumeHash) — this is a recruiter building
          // a candidate pool for the job, NOT a candidate
          // application. No Application is created here; see
          // routes/applicationRoutes.ts and /apply for the
          // actual application flow, which is untouched.
          // --------------------------------------------------

          const { resume, isDuplicate } = await findOrCreateResume({
            candidateId: candidate._id,
            jobId: job._id,
            resumeHash,
            filePath: file.path,
            resumeText,
            aiAnalysis,
          });

          // --------------------------------------------------
          // 4.6 Store result
          // --------------------------------------------------

          extractedResumes.push({
            fileName: file.originalname,
            candidate,
            resume,
            resumeText,
            aiAnalysis,
            status: isDuplicate ? "DUPLICATE" : "CREATED",
            message: isDuplicate
              ? "Resume already exists for this job"
              : "Resume added to the job's resume pool",
            matching: {
              status: match.status,
              confidenceScore: match.confidenceScore,
              matchedFields: match.matchedFields,
            },
          });
        } catch (fileError) {
          console.error(
            `Failed to process ${file.originalname}:`,
            fileError
          );

          extractedResumes.push({
            fileName: file.originalname,
            error:
              fileError instanceof Error
                ? fileError.message
                : "Failed to process resume",
          });
        }
      }

      // ------------------------------------------------------
      // 5. Rank successful resumes
      // ------------------------------------------------------

      extractedResumes.sort(
        (a, b) =>
          (b.aiAnalysis?.overallMatchScore ?? -1) -
          (a.aiAnalysis?.overallMatchScore ?? -1)
      );

      // ------------------------------------------------------
      // 6. Add rank
      // ------------------------------------------------------

      const rankedResumes = extractedResumes.map((item, index) => ({
        rank: item.aiAnalysis ? index + 1 : null,
        ...item,
      }));

      // ------------------------------------------------------
      // 7. Response
      // ------------------------------------------------------

      return res.status(200).json({
        message: "Resumes uploaded, analyzed and processed successfully",

        totalFiles: files.length,

        processedFiles: extractedResumes.filter((item) => item.aiAnalysis)
          .length,

        failedFiles: extractedResumes.filter((item) => !item.aiAnalysis)
          .length,

        candidates: rankedResumes,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================
// GET ALL CANDIDATES
// ============================================================

router.get("/", async (_req, res, next) => {
  try {
    const candidates = await Candidate.find();

    return res.status(200).json({
      candidates,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET SINGLE CANDIDATE
// ============================================================

router.get("/:id", async (req, res, next) => {
  try {
    const candidate = await Candidate.findById(req.params.id);

    if (!candidate) {
      return res.status(404).json({
        message: "Candidate not found",
      });
    }

    return res.status(200).json({
      candidate,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
