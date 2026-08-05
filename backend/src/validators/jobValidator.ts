import Joi from "joi";

export const jobSchema = Joi.object({
  title: Joi.string()
    .min(5)
    .max(100)
    .required(),

  description: Joi.string()
    .min(20)
    .max(1000)
    .required(),

  status: Joi.string()
    .valid("OPEN", "CLOSED")
    .default("OPEN"),
});