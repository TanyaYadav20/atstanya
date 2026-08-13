import { Router } from "express";
import upload from "../middleware/upload";
import Candidate from "../models/Candidate";
import Application from "../models/Application";
import { candidateSchema } from "../validators/candidateValidator";
import { parseResume } from "../utils/resumeParser";
import Job from "../models/Job";
import { analyzeCandidate } from "../services/gemini.service";
import {
  findOrCreateCandidate,
  ensureNoDuplicateApplication,
} from "../services/candidate.service";

const router = Router();


// Candidate Apply - Single Resume

router.post(
  "/apply",
  upload.single("resume"),
  async (req, res) => {
    try {
      
      // 1. Check resume
      
      if (!req.file) {
        return res.status(400).json({
          message: "Resume is required",
        });
      }

      
      // 2. Validate candidate details
     
      const { error, value } = candidateSchema.validate(req.body);

      if (error) {
        return res.status(400).json({
          message: error.details[0].message,
        });
      }

      const {
        name,
        email,
        phone,
        totalExperienceYears,
        jobId,
      } = value;

      
      // 3. Find job
      
      const job = await Job.findById(jobId);

      if (!job) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      
      // 4. Parse resume
      
      const resumeText = await parseResume(
        req.file.path
      );

      console.log(
        "Resume parsed successfully",
     {
       characters: resumeText.length,
     }
    );

      
      // 5. Find or create candidate
      

     const candidate = await findOrCreateCandidate({
     name,
     email,
     phone,
     totalExperienceYears,
     resumeFilePath: req.file.path,
     resumeText,
    });


      
      // 6. Check duplicate application
      
      await ensureNoDuplicateApplication(
      candidate._id.toString(),
     job._id.toString()
     );

      
      // 7. Create application FIRST
      

      const application =
        await Application.create({
          candidateId: candidate._id,
          jobId: job._id,
          status: "APPLIED",
        });

      
      // 8. AI analysis AFTER application creation
      
      let aiAnalysis;

      try {
        aiAnalysis = await analyzeCandidate(
          job,
          resumeText
        );

       
        // 9. Save AI analysis to application
        
        application.aiAnalysis = aiAnalysis;

        await application.save();

      } catch (aiError) {
        console.error(
          "AI analysis failed:",
          aiError
        );

        // Application still exists even if AI fails

        return res.status(201).json({
          message:
            "Application submitted, but AI analysis failed",
          candidate,
          application,
          resumeText,
        });
      }

      
      // 10. Response
      

      return res.status(201).json({
        message:
          "Application submitted and analyzed successfully",

        candidate,

        application,


        aiAnalysis,
      });

    } catch (error) {
  console.error("Candidate apply error:", error);

  const statusCode =
    error instanceof Error &&
    "statusCode" in error
      ? (error as Error & {
          statusCode?: number;
        }).statusCode ?? 500
      : 500;

  return res.status(statusCode).json({
    message:
      error instanceof Error
        ? error.message
        : "Internal Server Error",
  });
}
  }
);



// Recruiter Upload Multiple Resumes


router.post(
  "/upload-resume",
  upload.array("resumes", 20),
  async (req, res) => {
    try {
     console.log(
     "Resume files received:",
      Array.isArray(req.files)
      ? req.files.length
      : 0
    );

      const files =
        req.files as Express.Multer.File[];

      const { jobId } = req.body;

      
      // 1. Validate Job ID
     
      if (!jobId) {
        return res.status(400).json({
          message: "Job ID is required",
        });
      }

      
      // 2. Find job
      
      const job = await Job.findById(jobId);

      if (!job) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      
      // 3. Validate files
      
      if (!files || files.length === 0) {
        return res.status(400).json({
          message:
            "Please upload at least one resume",
        });
      }

      const extractedResumes: any[] = [];

      
      // 4. Process each resume
      
      for (const file of files) {
        try {
          
          // 4.1 Parse resume
          
          const resumeText =
            await parseResume(file.path);

          console.log(
            `Processing: ${file.originalname}`
          );

          
          // 4.2 AI analysis BEFORE application creation
         
          

          const aiAnalysis =
            await analyzeCandidate(
              job,
              resumeText
            );

          console.log(
            `AI score for ${file.originalname}:`,
            aiAnalysis.overallMatchScore
          );

          
          // 4.3 Create candidate
         
          const candidate =
            await findOrCreateCandidate({
              name: aiAnalysis.candidate.name,
              email: aiAnalysis.candidate.email,
              phone: aiAnalysis.candidate.phone,
              totalExperienceYears: aiAnalysis.candidate.totalExperienceYears,
              resumeFilePath: file.path,
              resumeText,
            });

            await ensureNoDuplicateApplication(
            candidate._id.toString(),
            job._id.toString()
       );

          
          // 4.4 Create application AFTER AI analysis
          
          const application =
            await Application.create({
              candidateId: candidate._id,
              jobId: job._id,
              status: "APPLIED",
              aiAnalysis,
            });

          
          // 4.5 Store result
          
          extractedResumes.push({
            fileName: file.originalname,
            candidate,
            application,
            resumeText,
            aiAnalysis,
          });

        } catch (fileError) {
          console.error(
            `Failed to process ${file.originalname}:`,
            fileError
          );

          // Continue processing remaining resumes
          extractedResumes.push({
              fileName: file.originalname,
              error:
               fileError instanceof Error
                ? fileError.message
                : "Failed to process resume",
          });
        }
      }

      
      // 5. Rank successfully processed resumes
      

      extractedResumes.sort(
        (a, b) =>
          (b.aiAnalysis?.overallMatchScore ?? -1) -
          (a.aiAnalysis?.overallMatchScore ?? -1)
      );

      
      // 6. Add response-only rank
     
      const rankedResumes =
        extractedResumes.map(
          (item, index) => ({
            rank:
              item.aiAnalysis
                ? index + 1
                : null,

            ...item,
          })
        );

      
      // 7. Response
      
      return res.status(200).json({
        message:
          "Resumes uploaded, analyzed and ranked successfully",

        totalFiles: files.length,

        processedFiles:
          extractedResumes.filter(
            (item) => item.aiAnalysis
          ).length,

        failedFiles:
          extractedResumes.filter(
            (item) => !item.aiAnalysis
          ).length,

        candidates: rankedResumes,
      });

    } catch (error) {
      console.error(
        "Upload resume error:",
        error
      );

      return res.status(500).json({
        message: "Internal Server Error",
      });
    }
  }
);


// ============================================================
// Get All Candidates
// ============================================================

router.get(
  "/",
  async (_req, res) => {
    try {
      const candidates =
        await Candidate.find();

      return res.status(200).json({
        candidates,
      });

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Internal Server Error",
      });
    }
  }
);


// ============================================================
// Get Single Candidate
// ============================================================

router.get(
  "/:id",
  async (req, res) => {
    try {
      const candidate =
        await Candidate.findById(
          req.params.id
        );

      if (!candidate) {
        return res.status(404).json({
          message:
            "Candidate not found",
        });
      }

      return res.status(200).json({
        candidate,
      });

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Internal Server Error",
      });
    }
  }
);


export default router;