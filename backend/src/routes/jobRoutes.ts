import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import Job from "../models/Job";

const router = Router();

router.post("/", requireAuth, async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const job = new Job({
      title,
      description,
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

export default router;