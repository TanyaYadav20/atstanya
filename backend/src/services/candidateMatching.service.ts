import { type HydratedDocument } from "mongoose";
import Candidate, {
  type ICandidate,
  type IPossibleDuplicate,
} from "../models/Candidate";
import { normalizeText, normalizePhone, normalizeUrl } from "../utils/normalize";


// TYPES


export type CandidateDoc = HydratedDocument<ICandidate>;

export interface CandidateIdentity {
  name: string;
  phone?: string;
  linkedinUrl?: string;
  githubUrl?: string;
}

export interface CandidateMatch {
  candidate: CandidateDoc | null;

  confidenceScore: number;

  status:
    | "MATCH"
    | "REVIEW"
    | "NEW";

  matchedFields: string[];

  reasons: string[];
}


// CONFIGURATION


// These are starting weights.
// Tune them later using your actual resume data.

const WEIGHTS = {
  linkedin: 40,
  github: 25,
  phone: 20,
  name: 10,
  experience: 5,
};

// Confidence thresholds

const HIGH_CONFIDENCE = 85;
const REVIEW_THRESHOLD = 60;

// ============================================================
// FIELD MATCHING
//
// Normalization (normalizeText/normalizePhone/normalizeUrl)
// lives in ../utils/normalize.ts so the Candidate schema (which
// normalizes linkedinUrl/githubUrl on write) and this matcher
// (which normalizes on read/compare) can never drift apart.
// ============================================================

function isExactMatch(
  first?: string,
  second?: string
): boolean {
  const a = normalizeText(first);
  const b = normalizeText(second);

  if (!a || !b) {
    return false;
  }

  return a === b;
}

function isPhoneMatch(
  first?: string,
  second?: string
): boolean {
  const a = normalizePhone(first);
  const b = normalizePhone(second);

  if (!a || !b) {
    return false;
  }

  return a === b;
}

function isUrlMatch(
  first?: string,
  second?: string
): boolean {
  const a = normalizeUrl(first);
  const b = normalizeUrl(second);

  if (!a || !b) {
    return false;
  }

  return a === b;
}


// CALCULATE MATCH SCORE

export function calculateCandidateMatchScore(
  incoming: CandidateIdentity,
  existing: CandidateDoc
): {
  score: number;
  matchedFields: string[];
  reasons: string[];
} {
  let score = 0;

  const matchedFields: string[] = [];
  const reasons: string[] = [];

  
  // LinkedIn
  

  if (
    isUrlMatch(
      incoming.linkedinUrl,
      existing.linkedinUrl
    )
  ) {
    score += WEIGHTS.linkedin;

    matchedFields.push(
      "linkedinUrl"
    );

    reasons.push(
      "LinkedIn URL matches"
    );
  }

  
  // GitHub
  
  if (
    isUrlMatch(
      incoming.githubUrl,
      existing.githubUrl
    )
  ) {
    score += WEIGHTS.github;

    matchedFields.push(
      "githubUrl"
    );

    reasons.push(
      "GitHub URL matches"
    );
  }

  
  // Phone
  

  if (
    isPhoneMatch(
      incoming.phone,
      existing.phone
    )
  ) {
    score += WEIGHTS.phone;

    matchedFields.push(
      "phone"
    );

    reasons.push(
      "Phone number matches"
    );
  }

  
  // Name
  
  if (
    isExactMatch(
      incoming.name,
      existing.name
    )
  ) {
    score += WEIGHTS.name;

    matchedFields.push(
      "name"
    );

    reasons.push(
      "Name matches"
    );
  }

  // ----------------------------------------------------------
  // Experience
  // ----------------------------------------------------------

  // Experience is intentionally not used here because
  // a candidate's experience changes over time.
  //
  // The WEIGHTS.experience value is reserved for future
  // fuzzy matching and should not currently affect identity.

  return {
    score,
    matchedFields,
    reasons,
  };
}


// FIND POSSIBLE CANDIDATES


async function findPossibleCandidates(
  identity: CandidateIdentity
): Promise<CandidateDoc[]> {
  const candidates: CandidateDoc[] = [];

  
  // Phone is a strong candidate lookup signal
  

  if (identity.phone) {
    const phone =
      normalizePhone(
        identity.phone
      );

    if (phone) {
      const phoneCandidates =
        await Candidate.find({
          phone: identity.phone,
        });

      candidates.push(
        ...phoneCandidates
      );
    }
  }

 
  // LinkedIn is another strong lookup signal
  
  if (identity.linkedinUrl) {
    const linkedin =
      normalizeUrl(
        identity.linkedinUrl
      );

    if (linkedin) {
      const linkedinCandidates =
        await Candidate.find({
          linkedinUrl: {
            $regex: new RegExp(
              `^${escapeRegex(
                linkedin
              )}$`,
              "i"
            ),
          },
        });

      candidates.push(
        ...linkedinCandidates
      );
    }
  }

  
  // GitHub
  
  if (identity.githubUrl) {
    const github =
      normalizeUrl(
        identity.githubUrl
      );

    if (github) {
      const githubCandidates =
        await Candidate.find({
          githubUrl: {
            $regex: new RegExp(
              `^${escapeRegex(
                github
              )}$`,
              "i"
            ),
          },
        });

      candidates.push(
        ...githubCandidates
      );
    }
  }

  
  // Remove duplicates
  
  const uniqueCandidates =
    new Map<string, CandidateDoc>();

  for (const candidate of candidates) {
    uniqueCandidates.set(
      candidate._id.toString(),
      candidate
    );
  }

  return Array.from(
    uniqueCandidates.values()
  );
}

// ============================================================
// REGEX ESCAPE
// ============================================================

function escapeRegex(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

// ============================================================
// FIND BEST CANDIDATE MATCH
// ============================================================

export async function findBestCandidateMatch(
  identity: CandidateIdentity
): Promise<CandidateMatch> {

  // ----------------------------------------------------------
  // Validate incoming identity
  // ----------------------------------------------------------

  if (!identity.name?.trim()) {
    throw new Error(
      "Candidate name is required for matching"
    );
  }

  // ----------------------------------------------------------
  // Find possible candidates
  // ----------------------------------------------------------

  const possibleCandidates =
    await findPossibleCandidates(
      identity
    );

  // ----------------------------------------------------------
  // No possible candidates
  // ----------------------------------------------------------

  if (
    possibleCandidates.length === 0
  ) {
    return {
      candidate: null,

      confidenceScore: 0,

      status: "NEW",

      matchedFields: [],

      reasons: [
        "No existing candidate matched the available identity signals",
      ],
    };
  }

  // ----------------------------------------------------------
  // Calculate score for every candidate
  // ----------------------------------------------------------

  const matches =
    possibleCandidates.map(
      (candidate) => {
        const result =
          calculateCandidateMatchScore(
            identity,
            candidate
          );

        return {
          candidate,
          ...result,
        };
      }
    );

  // ----------------------------------------------------------
  // Sort highest score first
  // ----------------------------------------------------------

  matches.sort(
    (a, b) =>
      b.score - a.score
  );

  const bestMatch =
    matches[0];

  // `matches` is mapped 1:1 from `possibleCandidates`, and we've
  // already returned early when that array is empty — so this
  // is unreachable in practice. The guard exists to satisfy
  // `noUncheckedIndexedAccess` without an `any` cast or a
  // non-null assertion, and to fail safely (as NEW, never as a
  // silent match) in case that invariant is ever broken.
  if (!bestMatch) {
    return {
      candidate: null,
      confidenceScore: 0,
      status: "NEW",
      matchedFields: [],
      reasons: [
        "No scoreable candidate signals were available",
      ],
    };
  }

  // ----------------------------------------------------------
  // High confidence
  // ----------------------------------------------------------

  if (
    bestMatch.score >=
    HIGH_CONFIDENCE
  ) {
    return {
      candidate:
        bestMatch.candidate,

      confidenceScore:
        bestMatch.score,

      status: "MATCH",

      matchedFields:
        bestMatch.matchedFields,

      reasons:
        bestMatch.reasons,
    };
  }

  // ----------------------------------------------------------
  // Medium confidence
  // ----------------------------------------------------------

  if (
    bestMatch.score >=
    REVIEW_THRESHOLD
  ) {
    return {
      candidate:
        bestMatch.candidate,

      confidenceScore:
        bestMatch.score,

      status: "REVIEW",

      matchedFields:
        bestMatch.matchedFields,

      reasons: [
        ...bestMatch.reasons,

        "Match confidence is not high enough for automatic merging",
      ],
    };
  }

  // ----------------------------------------------------------
  // Low confidence
  // ----------------------------------------------------------

  return {
    candidate: null,

    confidenceScore:
      bestMatch.score,

    status: "NEW",

    matchedFields:
      bestMatch.matchedFields,

    reasons: [
      ...bestMatch.reasons,

      "Match confidence is too low to identify the candidate",
    ],
  };
}

// ============================================================
// CREATE NEW CANDIDATE
// ============================================================

async function createNewCandidate(
  identity: CandidateIdentity & {
    email: string;
    totalExperienceYears: number;
  },
  possibleDuplicateOf: IPossibleDuplicate[]
): Promise<CandidateDoc> {
  return Candidate.create({
    name: identity.name,

    email: identity.email,

    phone: identity.phone ?? "",

    totalExperienceYears: identity.totalExperienceYears,

    linkedinUrl: identity.linkedinUrl,

    githubUrl: identity.githubUrl,

    possibleDuplicateOf,
  });
}

// ============================================================
// MATCH OR CREATE CANDIDATE
// ============================================================

export async function matchOrCreateCandidate(
  identity: CandidateIdentity & {
    email: string;
    totalExperienceYears: number;
  }
) {
  const match =
    await findBestCandidateMatch(
      identity
    );

  // ----------------------------------------------------------
  // Existing candidate
  // ----------------------------------------------------------

  if (
    match.status === "MATCH" &&
    match.candidate
  ) {
    const candidate =
      match.candidate;

    // Update information that may have changed.
    // Do NOT update resume information here.
    candidate.name =
      identity.name;

    if (identity.phone) {
      candidate.phone =
        identity.phone;
    }

    if (identity.linkedinUrl) {
      candidate.linkedinUrl =
        identity.linkedinUrl;
    }

    if (identity.githubUrl) {
      candidate.githubUrl =
        identity.githubUrl;
    }

    candidate.totalExperienceYears =
      identity.totalExperienceYears;

    await candidate.save();

    return {
      candidate,

      confidenceScore:
        match.confidenceScore,

      status: "MATCH" as const,

      matchedFields:
        match.matchedFields,

      reasons:
        match.reasons,
    };
  }

  // ----------------------------------------------------------
  // Uncertain match — per the architecture, this must NEVER
  // silently attach the new resume to the existing candidate it
  // resembles. Instead, a new Candidate is created (never lost)
  // and the ambiguous match is recorded on it via
  // `possibleDuplicateOf`, so a recruiter/admin can confirm or
  // reject the merge later. The status returned is still
  // "REVIEW", so callers know not to treat this as a routine
  // new-candidate creation.
  // ----------------------------------------------------------

  if (
    match.status === "REVIEW" &&
    match.candidate
  ) {
    const candidate = await createNewCandidate(identity, [
      {
        candidateId: match.candidate._id,
        confidenceScore: match.confidenceScore,
        matchedFields: match.matchedFields,
        flaggedAt: new Date(),
      },
    ]);

    return {
      candidate,

      confidenceScore:
        match.confidenceScore,

      status: "REVIEW" as const,

      matchedFields:
        match.matchedFields,

      reasons: [
        ...match.reasons,
        `Created as a new candidate pending review — possible duplicate of ${match.candidate.candidateRef}`,
      ],
    };
  }

  // ----------------------------------------------------------
  // Create new candidate
  // ----------------------------------------------------------

  const candidate = await createNewCandidate(identity, []);

  return {
    candidate,

    confidenceScore:
      match.confidenceScore,

    status: "NEW" as const,

    matchedFields:
      match.matchedFields,

    reasons: [
      ...match.reasons,

      "New candidate created",
    ],
  };
}