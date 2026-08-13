import { Router } from "express";
import Job from "../models/Job";
import requireAuth from "../middleware/requireAuth";
import { jobSchema } from "../validators/jobValidator";

const router = Router();


  // Create Job

router.post("/", requireAuth, async (req, res) => {
  try {
    const { error, value } = jobSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message,
      });
    }

    const { title, description, status } = value;

    const job = new Job({
      title,
      description,
      status,
      createdBy: req.user?.userId,
    });

    await job.save();

    return res.status(201).json({
      message: "Job created successfully",
      job,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});


  // Get All Jobs

router.get("/", requireAuth, async (req, res) => {
  try {
    const jobs = await Job.find({});

    return res.status(200).json({
      jobs,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});


   //Get Single Job

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
    });

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    return res.status(200).json({
      job,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});


  // Update Job

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const updatedJob = await Job.findOneAndUpdate(
      {
        _id: req.params.id,
      },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedJob) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    return res.status(200).json({
      message: "Job updated successfully",
      job: updatedJob,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});


   //Delete Job

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const deletedJob = await Job.findOneAndDelete({
      _id: req.params.id,
    });

    if (!deletedJob) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    return res.status(200).json({
      message: "Job deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

export default router;