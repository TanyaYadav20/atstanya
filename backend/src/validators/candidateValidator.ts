import Joi from "joi";

export const candidateSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),

  email: Joi.string().email().required(),

  phone: Joi.string().min(10).max(15).required(),

  totalExperienceYears: Joi.number().min(0).required(),

  jobId: Joi.string().required(),
});