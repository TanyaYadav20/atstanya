import Candidate from "../models/Candidate";
import Application from "../models/Application";

interface CandidateData {
  name: string;
  email: string;
  phone: string;
  totalExperienceYears: number;
  resumeFilePath: string;
  resumeText: string;
}

export async function findOrCreateCandidate(
  data: CandidateData
) {
  const email = data.email.trim().toLowerCase();

  let candidate = await Candidate.findOne({
    email,
  });

  if (!candidate) {
    candidate = await Candidate.create({
      ...data,
      email,
    });
  } else {
    candidate.name = data.name;
    candidate.phone = data.phone;
    candidate.totalExperienceYears =
      data.totalExperienceYears;
    candidate.resumeFilePath =
      data.resumeFilePath;
    candidate.resumeText =
      data.resumeText;

    await candidate.save();
  }

  return candidate;
}

export async function ensureNoDuplicateApplication(
  candidateId: string,
  jobId: string
) {
  const existingApplication =
    await Application.findOne({
      candidateId,
      jobId,
    });

  if (existingApplication) {
    const error = new Error(
      "Candidate has already applied for this job"
    );

    (error as any).statusCode = 409;

    throw error;
  }
}