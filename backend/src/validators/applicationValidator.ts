import Joi from "joi";

export const bulkApplicationSchema = Joi.object({
  candidateIds: Joi.array().items(Joi.string().required()).min(1).required(),
});
