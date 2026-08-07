import { Router } from "express";
import upload from "../middleware/upload";
import Candidate from "../models/Candidate";
import Application from "../models/Application";
import { candidateSchema } from "../validators/candidateValidator";
import { parseResume } from "../utils/resumeParser";
import { structuredResumeParser } from "../utils/structuredResumeParser";

const router = Router();


   //Candidate Apply (Details + Single Resume)


router.post(
  "/apply",
  upload.single("resume"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Resume is required",
        });
      }

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

     // Extract Resume Text
      const resumeText = await parseResume(req.file.path);

     // Convert raw text into structured data
      const parsedResume = structuredResumeParser(resumeText);

      console.log("========== PARSED RESUME ==========");
      console.log(parsedResume);
      console.log("==================================");

      // Save Candidate
      const candidate = new Candidate({
        name,
        email,
        phone,
        totalExperienceYears,
        resumeFilePath: req.file.path,

        skills: parsedResume.skills,
        experience: parsedResume.experience,
        projects: parsedResume.projects,
        education: parsedResume.education,
      });

      await candidate.save();

      // Save Application
      const application = new Application({
        candidateId: candidate._id,
        jobId,
      });

      await application.save();

      return res.status(201).json({
        message: "Application submitted successfully",
        candidate,
        application,
        parsedResume,

      });

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Internal Server Error",
      });
    }
  }
);


   //Recruiter Upload Multiple Resumes

router.post(
  "/upload-resume",
  upload.array("resumes", 20),
  async (req, res) => {
    try {

        console.log("req.files: ", req.files);

      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({
          message: "Please upload at least one resume",
        });
      }

      const extractedResumes = [];

      for (const file of files) {
        const resumeText = await parseResume(file.path);
        const parsedResume = structuredResumeParser(resumeText);

        console.log(`Resume: ${file.originalname}`);
        console.log(parsedResume);

        extractedResumes.push({
          fileName: file.originalname,
          filePath: file.path,
          parsedResume,
        });
      }

      return res.status(200).json({
        message: "Resumes uploaded successfully",
        totalFiles: files.length,
        extractedResumes,
      });

    } catch (error) {
        console.log("in error")
      console.error(error);

      return res.status(500).json({
        message: "Internal Server Error",
      });
    }
  }
);


   //Get All Candidates

router.get("/", async (_req, res) => {
  try {
    const candidates = await Candidate.find();

    return res.status(200).json({
      candidates,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});


   //Get Single Candidate

router.get("/:id", async (req, res) => {
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
    console.error(error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

export default router;