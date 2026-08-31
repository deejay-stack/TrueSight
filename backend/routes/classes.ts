import express from "express";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import pool from "../config/db.js";
import { analyzeText as analyzeTextWithService } from "../services/TextService.js";
import { analyzeImage } from "../services/ImageService.js";
import {
  extractTextFromSubmissionFile,
  isImageSubmission,
} from "../services/FileTextExtractor.js";

const router = express.Router();

let schemaReady = false;

const notificationTypes = new Set([
  "new_activity",
  "upcoming_deadline",
  "new_submission",
]);
const notificationStatuses = new Set(["unread", "read"]);

const ensureClassroomSchema = async () => {
  if (schemaReady) return;

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profile_image_url TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(20) NOT NULL UNIQUE,
      description TEXT NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_count INTEGER NOT NULL DEFAULT 0,
      assignment_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_enrollments (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(class_id, student_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_enrollment_requests (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      cor_file_name VARCHAR(255) NOT NULL,
      cor_file_type VARCHAR(120),
      cor_file_size BIGINT,
      cor_data_url TEXT NOT NULL,
      rejection_note TEXT,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE class_enrollment_requests
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS cor_file_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS cor_file_type VARCHAR(120),
    ADD COLUMN IF NOT EXISTS cor_file_size BIGINT,
    ADD COLUMN IF NOT EXISTS cor_data_url TEXT,
    ADD COLUMN IF NOT EXISTS rejection_note TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS class_enrollment_requests_pending_unique
    ON class_enrollment_requests (class_id, student_id)
    WHERE status = 'pending'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      instructor VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      submission_type VARCHAR(20) NOT NULL CHECK (submission_type IN ('essay', 'file', 'image', 'code')),
      allow_resubmission BOOLEAN NOT NULL DEFAULT TRUE,
      max_score NUMERIC(7,2) NOT NULL DEFAULT 100,
      programming_language VARCHAR(80),
      starter_code TEXT,
      attachment_name VARCHAR(255),
      attachment_type VARCHAR(120),
      attachment_size BIGINT,
      attachment_data_url TEXT,
      due_date TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE activities
    ADD COLUMN IF NOT EXISTS allow_resubmission BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS max_score NUMERIC(7,2) NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS programming_language VARCHAR(80),
    ADD COLUMN IF NOT EXISTS starter_code TEXT,
    ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(120),
    ADD COLUMN IF NOT EXISTS attachment_size BIGINT,
    ADD COLUMN IF NOT EXISTS attachment_data_url TEXT
  `);

  await pool.query(`
    DO $$
    DECLARE
      existing_constraint_name TEXT;
    BEGIN
      SELECT conname INTO existing_constraint_name
      FROM pg_constraint
      WHERE conrelid = 'activities'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%submission_type%'
      LIMIT 1;

      IF existing_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE activities DROP CONSTRAINT %I',
          existing_constraint_name
        );
      END IF;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE activities
    ADD CONSTRAINT activities_submission_type_check
    CHECK (submission_type IN ('essay', 'file', 'image', 'code'))
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_text TEXT,
      file_name VARCHAR(255),
      file_type VARCHAR(120),
      file_size BIGINT,
      file_data_url TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      ai_probability NUMERIC(5,2),
      is_ai_generated BOOLEAN,
      analysis_details JSONB,
      submitted_version INTEGER NOT NULL DEFAULT 1,
      teacher_comments TEXT,
      teacher_remarks VARCHAR(120),
      teacher_grade VARCHAR(80),
      teacher_score NUMERIC(7,2),
      evaluated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      evaluated_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(activity_id, student_id)
    )
  `);

  await pool.query(`
    ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS file_type VARCHAR(120),
    ADD COLUMN IF NOT EXISTS file_size BIGINT,
    ADD COLUMN IF NOT EXISTS file_data_url TEXT,
    ADD COLUMN IF NOT EXISTS submitted_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS teacher_comments TEXT,
    ADD COLUMN IF NOT EXISTS teacher_remarks VARCHAR(120),
    ADD COLUMN IF NOT EXISTS teacher_grade VARCHAR(80),
    ADD COLUMN IF NOT EXISTS teacher_score NUMERIC(7,2),
    ADD COLUMN IF NOT EXISTS evaluated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submission_history (
      id SERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      content_text TEXT,
      file_name VARCHAR(255),
      file_type VARCHAR(120),
      file_size BIGINT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_role VARCHAR(20) NOT NULL CHECK (receiver_role IN ('teacher', 'student')),
      type VARCHAR(40) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
      related_submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'unread',
      read_at TIMESTAMPTZ,
      dedupe_key VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS receiver_role VARCHAR(20),
    ADD COLUMN IF NOT EXISTS type VARCHAR(40),
    ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'info',
    ADD COLUMN IF NOT EXISTS title VARCHAR(255),
    ADD COLUMN IF NOT EXISTS message TEXT,
    ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS related_submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'unread',
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_unique
    ON notifications (dedupe_key)
    WHERE dedupe_key IS NOT NULL
  `);

  schemaReady = true;
};

const clearAuthCookie = (res: Response) => {
  res.cookie("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 1,
  });
};

const protect = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureClassroomSchema();

    const token = req.cookies?.token;

    if (!token) {
      return res
        .status(401)
        .json({ message: "Not authorized. No token found." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;

    const user = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.profile_image_url,
              COALESCE(up.notifications_enabled, TRUE) AS notifications
       FROM users u
       LEFT JOIN user_preferences up ON up.user_id = u.id
       WHERE u.id = $1`,
      [decoded.id],
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ message: "User not found." });
    }

    if (
      typeof decoded.role === "string" &&
      decoded.role !== user.rows[0].role
    ) {
      clearAuthCookie(res);
      return res.status(401).json({ message: "Invalid or expired token." });
    }

    req.user = user.rows[0];
    next();
  } catch {
    clearAuthCookie(res);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

const MAX_DOCUMENT_DATA_URL_LENGTH = 6_500_000;
const ACTIVITY_SUBMISSION_TYPES = new Set(["essay", "file", "image", "code"]);
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "txt",
  "md",
  "csv",
  "json",
]);
const SUPPORTED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
];
const FILE_SUBMISSION_EXTENSIONS = new Set(["pdf", "docx"]);
const FILE_SUBMISSION_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const IMAGE_SUBMISSION_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const IMAGE_SUBMISSION_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const ENROLLMENT_REQUEST_STATUSES = new Set(["pending", "accepted", "rejected"]);

type HttpStatusError = Error & { statusCode?: number };

const asTrimmedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const getFileExtension = (fileName) => {
  const match = String(fileName ?? "")
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);

  return match?.[1] ?? "";
};

const isSupportedDocument = (fileName, fileType) => {
  const normalizedType = asTrimmedString(fileType).toLowerCase();
  const extension = getFileExtension(fileName);

  return (
    SUPPORTED_DOCUMENT_TYPES.includes(normalizedType) ||
    SUPPORTED_DOCUMENT_EXTENSIONS.has(extension)
  );
};

const hasUploadPayload = ({ fileName, fileType, fileSize, fileDataUrl }) =>
  Boolean(
    asTrimmedString(fileName) ||
      asTrimmedString(fileType) ||
      asTrimmedString(fileDataUrl) ||
      fileSize !== undefined,
  );

const isAllowedFileSubmission = (fileName, fileType) => {
  const normalizedType = asTrimmedString(fileType).toLowerCase();
  const extension = getFileExtension(fileName);

  return (
    FILE_SUBMISSION_TYPES.has(normalizedType) ||
    FILE_SUBMISSION_EXTENSIONS.has(extension)
  );
};

const isAllowedImageSubmission = (fileName, fileType) => {
  const normalizedType = asTrimmedString(fileType).toLowerCase();
  const extension = getFileExtension(fileName);

  return (
    IMAGE_SUBMISSION_TYPES.has(normalizedType) ||
    IMAGE_SUBMISSION_EXTENSIONS.has(extension)
  );
};

const isAllowedSubmissionUpload = (submissionType, fileName, fileType) => {
  if (submissionType === "file") {
    return isAllowedFileSubmission(fileName, fileType);
  }

  if (submissionType === "image") {
    return isAllowedImageSubmission(fileName, fileType);
  }

  return false;
};

const normalizeCorUpload = ({ fileName, fileType, fileSize, fileDataUrl }) => {
  const upload = normalizeDocumentUpload({
    fileName,
    fileType,
    fileSize,
    fileDataUrl,
  });

  if (!upload.fileName || !upload.fileDataUrl) {
    const error: HttpStatusError = new Error("A COR image upload is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!isAllowedImageSubmission(upload.fileName, upload.fileType)) {
    const error: HttpStatusError = new Error(
      "COR uploads only accept PNG, JPG, JPEG, or WEBP images.",
    );
    error.statusCode = 415;
    throw error;
  }

  return upload;
};

const normalizeDocumentUpload = ({
  fileName,
  fileType,
  fileSize,
  fileDataUrl,
}) => {
  const normalizedName = asTrimmedString(fileName);
  const normalizedType = asTrimmedString(fileType) || null;
  const normalizedDataUrl = asTrimmedString(fileDataUrl) || null;
  const normalizedSize = Number(fileSize);

  if (!normalizedName && !normalizedDataUrl) {
    return {
      fileName: null,
      fileType: null,
      fileSize: null,
      fileDataUrl: null,
    };
  }

  if (!normalizedName) {
    const error: HttpStatusError = new Error("Document uploads require a file name.");
    error.statusCode = 400;
    throw error;
  }

  if (!isSupportedDocument(normalizedName, normalizedType)) {
    const error: HttpStatusError = new Error(
      "Unsupported document type. Upload PDF, DOC, DOCX, image, or text-based files.",
    );
    error.statusCode = 415;
    throw error;
  }

  if (
    normalizedDataUrl &&
    !/^data:[^;]+;base64,/i.test(normalizedDataUrl) &&
    !/^data:text\/[^,]+,/i.test(normalizedDataUrl)
  ) {
    const error: HttpStatusError = new Error("Document preview data is invalid.");
    error.statusCode = 400;
    throw error;
  }

  if (
    normalizedDataUrl &&
    normalizedDataUrl.length > MAX_DOCUMENT_DATA_URL_LENGTH
  ) {
    const error: HttpStatusError = new Error("Document is too large to preview in-app.");
    error.statusCode = 413;
    throw error;
  }

  return {
    fileName: normalizedName,
    fileType: normalizedType,
    fileSize: Number.isFinite(normalizedSize) ? normalizedSize : null,
    fileDataUrl: normalizedDataUrl,
  };
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const computeVariance = (values) => {
  if (!values.length) return 0;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return variance;
};

const average = (values) => {
  if (!values.length) {
    return null;
  }

  const sum = values.reduce((accumulator, value) => accumulator + value, 0);
  return Number((sum / values.length).toFixed(2));
};

const deriveConfidenceLevel = (confidenceScore) => {
  if (confidenceScore >= 85) {
    return "Very High";
  }

  if (confidenceScore >= 72) {
    return "High";
  }

  if (confidenceScore >= 60) {
    return "Moderate";
  }

  return "Low";
};

const TRANSITION_PATTERN =
  /\b(however|therefore|moreover|furthermore|additionally|meanwhile|consequently|nonetheless|instead|for example|for instance|in contrast|as a result|in conclusion|on the other hand)\b/i;

const TEMPLATE_TRANSITION_OPENER_PATTERN =
  /^(moreover|furthermore|additionally|therefore|in conclusion|overall|to summarize|as a result)\b/i;

const extractSentences = (text) => {
  const fromPunctuation = (String(text).match(/[^.!?]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (fromPunctuation.length > 0) {
    return fromPunctuation;
  }

  return String(text)
    .split(/\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

const scoreSuspiciousSentence = (sentence, index) => {
  const lowered = sentence.toLowerCase();
  const words = lowered.match(/\b[a-z0-9']+\b/g) ?? [];

  if (!words.length) {
    return null;
  }

  const uniqueRatio = new Set(words).size / words.length;
  const reasons = [];
  let suspicionScore = 20;

  let repeatedNeighbors = 0;
  for (let position = 1; position < words.length; position += 1) {
    if (words[position] === words[position - 1]) {
      repeatedNeighbors += 1;
    }
  }

  const repeatedNeighborRatio = words.length
    ? repeatedNeighbors / words.length
    : 0;

  if (uniqueRatio < 0.62 && words.length >= 8) {
    suspicionScore += 20;
    reasons.push("Repetitive phrasing");
  }

  if (words.length >= 18 && words.length <= 28) {
    suspicionScore += 12;
    reasons.push("Robotic sentence structure");
  }

  if (repeatedNeighborRatio > 0.03) {
    suspicionScore += 16;
    reasons.push("Repeated neighboring words");
  }

  if (TEMPLATE_TRANSITION_OPENER_PATTERN.test(lowered)) {
    suspicionScore += 14;
    reasons.push("Template-like transition opener");
  }

  if (!TRANSITION_PATTERN.test(lowered) && words.length >= 17) {
    suspicionScore += 8;
    reasons.push("Unnatural transition cue");
  }

  if (!/[!?]/.test(sentence) && /[,;:]/.test(sentence) && words.length >= 20) {
    suspicionScore += 10;
    reasons.push("Over-perfect grammar pattern");
  }

  const score = Number(clamp(Math.round(suspicionScore), 1, 100).toFixed(2));

  return {
    sentenceNumber: index + 1,
    sentence,
    aiSuspicionScore: score,
    reasons,
  };
};

const buildExplainabilitySignals = ({
  uniqueRatio,
  repetitionRatio,
  sentenceLengthStdDeviation,
  averageSentenceLength,
  transitionDensity,
  repeatedOpenerRatio,
  formalSentenceRatio,
  contractionRatio,
}) => {
  const repetitivePhrasingScore = clamp(
    Math.round((1 - uniqueRatio) * 90 + repetitionRatio * 420),
    0,
    100,
  );

  const roboticStructureScore = clamp(
    Math.round(
      ((18 - Math.min(sentenceLengthStdDeviation, 18)) / 18) * 70 +
        (averageSentenceLength >= 16 && averageSentenceLength <= 25 ? 20 : 8) +
        (repeatedOpenerRatio > 0.15 ? 10 : 0),
    ),
    0,
    100,
  );

  const unnaturalTransitionsScore = clamp(
    Math.round(
      (1 - Math.min(transitionDensity, 1)) * 60 +
        repeatedOpenerRatio * 30 +
        (averageSentenceLength > 22 ? 10 : 0),
    ),
    0,
    100,
  );

  const overPerfectGrammarScore = clamp(
    Math.round(
      formalSentenceRatio * 70 +
        (contractionRatio <= 0.005 ? 20 : 0) +
        (sentenceLengthStdDeviation < 4.5 ? 10 : 0),
    ),
    0,
    100,
  );

  return [
    {
      id: "repetitivePhrasing",
      label: "Repetitive phrasing",
      score: repetitivePhrasingScore,
      explanation:
        "Repeated vocabulary and neighboring terms can indicate machine-like wording reuse.",
    },
    {
      id: "roboticStructure",
      label: "Robotic structure",
      score: roboticStructureScore,
      explanation:
        "Very uniform sentence size and mirrored phrasing patterns can appear algorithmic.",
    },
    {
      id: "unnaturalTransitions",
      label: "Unnatural transitions",
      score: unnaturalTransitionsScore,
      explanation:
        "Abrupt sentence connections or template-style connectors can signal generated flow.",
    },
    {
      id: "overPerfectGrammar",
      label: "Over-perfect grammar",
      score: overPerfectGrammarScore,
      explanation:
        "Exceptionally polished grammar with little natural variation can be AI-leaning.",
    },
  ];
};

const runHeuristicAnalysis = (text) => {
  const rawText = String(text ?? "");
  const normalized = rawText.trim().toLowerCase();

  if (!normalized) {
    return {
      probability: 0,
      isAIGenerated: false,
      details: {
        source: "system",
        verdict: "No readable text found for analysis",
        confidenceLevel: "Low",
        writingConsistencyScore: 0,
        humanRevisionLikelihood: 0,
        suspiciousSentences: [],
        explainabilitySignals: [
          {
            id: "repetitivePhrasing",
            label: "Repetitive phrasing",
            score: 0,
            explanation: "No text available for pattern scoring.",
          },
          {
            id: "roboticStructure",
            label: "Robotic structure",
            score: 0,
            explanation: "No text available for pattern scoring.",
          },
          {
            id: "unnaturalTransitions",
            label: "Unnatural transitions",
            score: 0,
            explanation: "No text available for pattern scoring.",
          },
          {
            id: "overPerfectGrammar",
            label: "Over-perfect grammar",
            score: 0,
            explanation: "No text available for pattern scoring.",
          },
        ],
        reasons: [
          "This submission appears to be file-only with no extracted text.",
          "Upload a text body to run confidence scoring.",
        ],
        metrics: {
          wordCount: 0,
          uniqueWordRatio: 0,
          averageSentenceLength: 0,
          sentenceVariance: 0,
          sentenceStdDeviation: 0,
          repetitionRatio: 0,
          transitionDensity: 0,
          repeatedOpenerRatio: 0,
          formalSentenceRatio: 0,
          contractionRatio: 0,
        },
      },
    };
  }

  const sentences = extractSentences(rawText);
  const words = normalized.match(/\b[a-z0-9']+\b/g) ?? [];
  const loweredSentences = sentences.map((sentence) => sentence.toLowerCase());

  const wordCount = words.length;
  const uniqueWordCount = new Set(words).size;
  const uniqueRatio = wordCount ? uniqueWordCount / wordCount : 1;

  const sentenceLengths = loweredSentences.map((sentence) => {
    const parts = sentence.match(/\b[a-z0-9']+\b/g) ?? [];
    return parts.length;
  });

  const averageSentenceLength =
    sentenceLengths.length > 0
      ? sentenceLengths.reduce((sum, count) => sum + count, 0) /
        sentenceLengths.length
      : 0;

  const sentenceVariance = computeVariance(sentenceLengths);
  const sentenceLengthStdDeviation = Math.sqrt(sentenceVariance);

  const transitionCount = loweredSentences.filter((sentence) =>
    TRANSITION_PATTERN.test(sentence),
  ).length;
  const transitionDensity = sentences.length
    ? transitionCount / sentences.length
    : 0;

  const openerCounts = new Map();
  for (const sentence of loweredSentences) {
    const sentenceWords = sentence.match(/\b[a-z0-9']+\b/g) ?? [];
    if (sentenceWords.length < 2) continue;

    const opener = `${sentenceWords[0]} ${sentenceWords[1]}`;
    openerCounts.set(opener, (openerCounts.get(opener) ?? 0) + 1);
  }

  const repeatedOpeners = Array.from(openerCounts.values()).reduce(
    (sum, count) => {
      if (count > 1) {
        return sum + (count - 1);
      }

      return sum;
    },
    0,
  );
  const repeatedOpenerRatio = sentences.length
    ? repeatedOpeners / sentences.length
    : 0;

  const formalSentenceCount = sentences.filter((sentence) => {
    const trimmed = sentence.trim();
    return /^[A-Z]/.test(trimmed) && /[.!?]$/.test(trimmed);
  }).length;
  const formalSentenceRatio = sentences.length
    ? formalSentenceCount / sentences.length
    : 0;

  const contractionCount =
    rawText.match(/\b\w+(?:n't|'re|'ve|'ll|'d|'m|'s)\b/gi)?.length ?? 0;
  const contractionRatio = wordCount ? contractionCount / wordCount : 0;

  let repetitionMatches = 0;
  for (let index = 1; index < words.length; index += 1) {
    if (words[index] === words[index - 1]) {
      repetitionMatches += 1;
    }
  }

  const repetitionRatio = wordCount > 0 ? repetitionMatches / wordCount : 0;

  let score = 35;
  const reasons = [];

  if (uniqueRatio < 0.52) {
    score += 16;
    reasons.push("Low lexical variation detected across the submission.");
  }

  if (sentenceVariance < 10) {
    score += 12;
    reasons.push(
      "Sentence length is very uniform, which may indicate generated text.",
    );
  }

  if (repetitionRatio > 0.03) {
    score += 13;
    reasons.push("Repeated neighboring words or patterns were found.");
  }

  if (averageSentenceLength > 22) {
    score += 8;
    reasons.push("Long and consistently structured sentences were observed.");
  }

  if (transitionDensity < 0.22 && sentences.length >= 4) {
    score += 8;
    reasons.push("Transitions between ideas appear formulaic or abrupt.");
  }

  if (
    formalSentenceRatio > 0.88 &&
    contractionRatio < 0.005 &&
    sentences.length >= 4
  ) {
    score += 9;
    reasons.push(
      "Grammar appears overly polished with limited natural variation.",
    );
  }

  const suspiciousSentences = sentences
    .map((sentence, index) => scoreSuspiciousSentence(sentence, index))
    .filter((entry) => entry && entry.aiSuspicionScore >= 56)
    .sort((left, right) => right.aiSuspicionScore - left.aiSuspicionScore)
    .slice(0, 8);

  if (suspiciousSentences.length > 0) {
    score += Math.min(12, suspiciousSentences.length * 2);
    reasons.push(
      "Sentence-level checks flagged sections with elevated AI-style patterns.",
    );
  }

  if (wordCount < 70) {
    score -= 8;
    reasons.push("Short content reduces confidence for AI detection.");
  }

  score = clamp(score, 1, 99);

  const explainabilitySignals = buildExplainabilitySignals({
    uniqueRatio,
    repetitionRatio,
    sentenceLengthStdDeviation,
    averageSentenceLength,
    transitionDensity,
    repeatedOpenerRatio,
    formalSentenceRatio,
    contractionRatio,
  });

  const overPerfectGrammarScore =
    explainabilitySignals.find((signal) => signal.id === "overPerfectGrammar")
      ?.score ?? 0;

  const writingConsistencyScore = clamp(
    Math.round(
      100 -
        Math.min(45, sentenceLengthStdDeviation * 6) -
        Math.min(22, Math.max(0, 0.58 - uniqueRatio) * 120) -
        Math.min(15, repetitionRatio * 280),
    ),
    0,
    100,
  );

  const humanRevisionLikelihood = clamp(
    Math.round(
      (100 - score) * 0.55 +
        writingConsistencyScore * 0.25 +
        (100 - overPerfectGrammarScore) * 0.2,
    ),
    0,
    100,
  );

  return {
    probability: Number(score.toFixed(2)),
    isAIGenerated: score >= 60,
    details: {
      source: "heuristic",
      verdict: score >= 60 ? "Likely AI-generated" : "Likely human-written",
      reasons,
      confidenceLevel: deriveConfidenceLevel(Math.max(score, 100 - score)),
      writingConsistencyScore,
      humanRevisionLikelihood,
      suspiciousSentences,
      explainabilitySignals,
      metrics: {
        wordCount,
        uniqueWordRatio: Number(uniqueRatio.toFixed(3)),
        averageSentenceLength: Number(averageSentenceLength.toFixed(2)),
        sentenceVariance: Number(sentenceVariance.toFixed(2)),
        sentenceStdDeviation: Number(sentenceLengthStdDeviation.toFixed(2)),
        repetitionRatio: Number(repetitionRatio.toFixed(3)),
        transitionDensity: Number(transitionDensity.toFixed(3)),
        repeatedOpenerRatio: Number(repeatedOpenerRatio.toFixed(3)),
        formalSentenceRatio: Number(formalSentenceRatio.toFixed(3)),
        contractionRatio: Number(contractionRatio.toFixed(4)),
      },
    },
  };
};

const getNumericCandidate = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value <= 1 ? value * 100 : value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed <= 1 ? parsed * 100 : parsed;
    }
  }

  return null;
};

const tryExtractProbability = (payload) => {
  const candidates = [
    payload?.documents?.[0]?.completely_generated_prob,
    payload?.documents?.[0]?.average_generated_prob,
    payload?.documents?.[0]?.ai_probability,
    payload?.ai_probability,
    payload?.probability,
    payload?.score,
  ];

  for (const candidate of candidates) {
    const numeric = getNumericCandidate(candidate);
    if (numeric !== null) {
      return clamp(numeric, 0, 100);
    }
  }

  return null;
};

const runGPTZeroAnalysis = async (text) => {
  const apiKey = process.env.GPTZERO_API_KEY;
  if (!apiKey) return null;

  try {
    // GPTZero integration guide:
    // 1) Set GPTZERO_API_KEY in backend/.env.
    // 2) Optionally override endpoint with GPTZERO_API_URL.
    // 3) Keep this request isolated so you can swap GPTZero versions without
    //    touching class/submission business logic.
    const endpoint =
      process.env.GPTZERO_API_URL ?? "https://api.gptzero.me/v2/predict/text";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ document: text }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const probability = tryExtractProbability(payload);

    if (probability === null) {
      return null;
    }

    return {
      probability: Number(probability.toFixed(2)),
      isAIGenerated: probability >= 60,
      details: {
        source: "gptzero",
        verdict:
          probability >= 60 ? "Likely AI-generated" : "Likely human-written",
        reasons: ["Scored using GPTZero API response."],
      },
    };
  } catch {
    return null;
  }
};

const normalizeScore = (value) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : null;

  if (numeric === null || !Number.isFinite(numeric)) {
    return null;
  }

  return clamp(Number(numeric.toFixed(2)), 0, 100);
};

const buildAnalysisSummary = (analysis) => {
  const aiProbability = clamp(Number(analysis.probability) || 0, 0, 100);
  const humanProbability = Number((100 - aiProbability).toFixed(2));
  const confidenceScore = Number(
    Math.max(aiProbability, humanProbability).toFixed(2),
  );
  const confidenceLevel = deriveConfidenceLevel(confidenceScore);

  const baselineConsistency = Number(
    (humanProbability * 0.75 + 12.5).toFixed(2),
  );
  const writingConsistencyScore =
    normalizeScore(analysis?.details?.writingConsistencyScore) ??
    clamp(baselineConsistency, 0, 100);

  const baselineHumanRevisionLikelihood = Number(
    ((humanProbability + writingConsistencyScore) / 2).toFixed(2),
  );
  const humanRevisionLikelihood =
    normalizeScore(analysis?.details?.humanRevisionLikelihood) ??
    clamp(baselineHumanRevisionLikelihood, 0, 100);

  return {
    aiProbability: Number(aiProbability.toFixed(2)),
    humanProbability,
    confidenceScore,
    isAIGenerated: aiProbability >= 60,
    details: {
      ...analysis.details,
      aiProbability: Number(aiProbability.toFixed(2)),
      humanProbability,
      confidenceScore,
      confidenceLevel,
      writingConsistencyScore,
      humanRevisionLikelihood,
    },
  };
};

const analyzeText = async (text) => {
  const heuristicAnalysis = runHeuristicAnalysis(text);
  const fromGPTZero = await runGPTZeroAnalysis(text);
  if (fromGPTZero && typeof fromGPTZero.probability === "number") {
    const blendedProbability = Number(
      (
        fromGPTZero.probability * 0.75 +
        heuristicAnalysis.probability * 0.25
      ).toFixed(2),
    );

    const heuristicReasons = Array.isArray(heuristicAnalysis.details?.reasons)
      ? heuristicAnalysis.details.reasons
      : [];

    return buildAnalysisSummary({
      probability: blendedProbability,
      isAIGenerated: blendedProbability >= 60,
      details: {
        ...heuristicAnalysis.details,
        source: "gptzero+heuristic",
        gptzeroProbability: Number(fromGPTZero.probability.toFixed(2)),
        heuristicProbability: Number(heuristicAnalysis.probability.toFixed(2)),
        verdict:
          blendedProbability >= 60
            ? "Likely AI-generated (blended model + heuristics)"
            : "Likely human-written (blended model + heuristics)",
        reasons: [
          `External model estimate: ${Number(fromGPTZero.probability).toFixed(2)}% AI probability.`,
          ...heuristicReasons,
        ],
      },
    });
  }

  return buildAnalysisSummary(heuristicAnalysis);
};

const getStudentIdentityKey = (name, email) =>
  `${String(email ?? "")
    .trim()
    .toLowerCase()}::${String(name ?? "")
    .trim()
    .toLowerCase()}`;

const getAccessibleClass = async (classId, user) => {
  if (user.role === "teacher") {
    const teacherClass = await pool.query(
      "SELECT * FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, user.id],
    );

    return teacherClass.rows[0] ?? null;
  }

  if (user.role === "student") {
    const studentClass = await pool.query(
      `SELECT c.*
       FROM classes c
       INNER JOIN class_enrollments ce ON ce.class_id = c.id
       WHERE c.id = $1 AND ce.student_id = $2`,
      [classId, user.id],
    );

    return studentClass.rows[0] ?? null;
  }

  return null;
};

const getAccessibleActivity = async (activityId, user) => {
  const activity = await pool.query(
    `SELECT a.id, a.class_id, c.teacher_id
     FROM activities a
     INNER JOIN classes c ON c.id = a.class_id
     WHERE a.id = $1
     LIMIT 1`,
    [activityId],
  );

  if (activity.rows.length === 0) {
    return null;
  }

  const activityRow = activity.rows[0];
  const classroom = await getAccessibleClass(activityRow.class_id, user);

  if (!classroom) {
    return null;
  }

  return activityRow;
};

const monthKeyFromDate = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const monthLabelFromDate = (date) =>
  date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const buildRecentMonthBuckets = (count = 6) => {
  const now = new Date();
  const buckets = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const bucketDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
    );

    buckets.push({
      key: monthKeyFromDate(bucketDate),
      month: monthLabelFromDate(bucketDate),
      submissions: 0,
      flaggedOutputs: 0,
      integrityScores: [],
    });
  }

  return buckets;
};

const toISOStringOrNull = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const normalizeNotificationType = (type) =>
  notificationTypes.has(type) ? type : "new_activity";

const normalizeNotificationStatus = (status) =>
  notificationStatuses.has(status) ? status : "unread";

const getStudentVisibleSubmissionStatus = (status) =>
  status === "analyzed" ? "Analyzed" : "Pending";

const normalizeAcademicScore = (value, maxScore) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > maxScore) {
    const error: HttpStatusError = new Error(
      `Score must be between 0 and ${maxScore}.`,
    );
    error.statusCode = 400;
    throw error;
  }

  return Number(score.toFixed(2));
};

const sanitizeStudentSubmission = (submission) => {
  if (!submission) return null;

  return {
    id: submission.id,
    activity_id: submission.activity_id,
    student_id: submission.student_id,
    content_text: submission.content_text,
    file_name: submission.file_name,
    file_type: submission.file_type,
    file_size: submission.file_size,
    status: getStudentVisibleSubmissionStatus(submission.status),
    ai_probability: submission.ai_probability,
    is_ai_generated: submission.is_ai_generated,
    analysis_details: submission.analysis_details,
    submitted_version: submission.submitted_version,
    teacher_comments: submission.teacher_comments,
    teacher_remarks: submission.teacher_remarks,
    teacher_grade: submission.teacher_grade,
    teacher_score: submission.teacher_score,
    evaluated_at: submission.evaluated_at,
    submitted_at: submission.submitted_at,
    updated_at: submission.updated_at,
  };
};

const createNotification = async ({
  userId,
  receiverRole,
  type,
  severity = "info",
  title,
  message,
  classId = null,
  activityId = null,
  submissionId = null,
  createdAt = null,
  dedupeKey = null,
}) => {
  if (!userId || !receiverRole || !title || !message) return;

  await pool.query(
    `INSERT INTO notifications (
       user_id, receiver_role, type, severity, title, message,
       class_id, activity_id, related_submission_id, created_at, dedupe_key
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()), $11)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [
      userId,
      receiverRole,
      normalizeNotificationType(type),
      severity === "warning" ? "warning" : "info",
      title,
      message,
      classId,
      activityId,
      submissionId,
      createdAt,
      dedupeKey,
    ],
  );
};

const createActivityNotifications = async (activityId) => {
  const activityResult = await pool.query(
    `SELECT a.id, a.class_id, a.title, a.created_at, a.due_date,
            c.name AS class_name
     FROM activities a
     INNER JOIN classes c ON c.id = a.class_id
     WHERE a.id = $1
     LIMIT 1`,
    [activityId],
  );

  const activity = activityResult.rows[0];
  if (!activity) return;

  const students = await pool.query(
    `SELECT student_id
     FROM class_enrollments
     WHERE class_id = $1
       AND joined_at <= $2`,
    [activity.class_id, activity.created_at],
  );

  await Promise.all(
    students.rows.map((student) =>
      createNotification({
        userId: student.student_id,
        receiverRole: "student",
        type: "new_activity",
        title: "New activity added",
        message: `${activity.title} was added in ${activity.class_name}.`,
        classId: activity.class_id,
        activityId: activity.id,
        createdAt: activity.created_at,
        dedupeKey: `student:${student.student_id}:new_activity:${activity.id}`,
      }),
    ),
  );
};

const createSubmissionNotification = async (submissionId) => {
  const submissionResult = await pool.query(
    `SELECT s.id, s.submitted_at, s.student_id, s.submitted_version,
            s.file_name, a.submission_type,
            a.id AS activity_id, a.class_id, a.title AS activity_title, a.due_date,
            c.name AS class_name, c.teacher_id, u.name AS student_name
     FROM submissions s
     INNER JOIN activities a ON a.id = s.activity_id
     INNER JOIN classes c ON c.id = a.class_id
     INNER JOIN users u ON u.id = s.student_id
     WHERE s.id = $1
     LIMIT 1`,
    [submissionId],
  );

  const submission = submissionResult.rows[0];
  if (!submission) return;

  const isResubmission = Number(submission.submitted_version ?? 1) > 1;
  const submissionKind =
    submission.submission_type === "image"
      ? "image submission"
      : submission.submission_type === "file"
        ? "file submission"
        : submission.submission_type === "code"
          ? "code submission"
          : "essay submission";
  const submittedFile = submission.file_name ? ` (${submission.file_name})` : "";

  await createNotification({
    userId: submission.teacher_id,
    receiverRole: "teacher",
    type: "new_submission",
    title: isResubmission ? "Student resubmission" : "New student submission",
    message: `${submission.student_name} ${isResubmission ? "resubmitted" : "submitted"} ${submission.activity_title} as a ${submissionKind}${submittedFile} in ${submission.class_name}.`,
    classId: submission.class_id,
    activityId: submission.activity_id,
    submissionId: submission.id,
    createdAt: submission.submitted_at,
    dedupeKey: `teacher:${submission.teacher_id}:new_submission:${submission.id}:v${submission.submitted_version ?? 1}`,
  });
};

const ensureUpcomingDeadlineNotifications = async (user) => {
  if (user.role === "student") {
    const activities = await pool.query(
      `SELECT a.id AS activity_id, a.class_id, c.name AS class_name,
              a.title AS activity_title, a.due_date
       FROM activities a
       INNER JOIN classes c ON c.id = a.class_id
       INNER JOIN class_enrollments ce ON ce.class_id = c.id
       LEFT JOIN submissions s ON s.activity_id = a.id AND s.student_id = $1
       WHERE ce.student_id = $1
         AND a.due_date > NOW()
         AND a.due_date <= NOW() + INTERVAL '1 hour'
         AND s.id IS NULL`,
      [user.id],
    );

    await Promise.all(
      activities.rows.map((activity) =>
        createNotification({
          userId: user.id,
          receiverRole: "student",
          type: "upcoming_deadline",
          severity: "warning",
          title: "Upcoming deadline",
          message: `${activity.activity_title} in ${activity.class_name} is due within 1 hour.`,
          classId: activity.class_id,
          activityId: activity.activity_id,
          createdAt: activity.due_date,
          dedupeKey: `student:${user.id}:upcoming_deadline:${activity.activity_id}`,
        }),
      ),
    );

    return;
  }

  // Teachers only need review-oriented notifications, such as submissions.
};

router.get("/mine", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can view class list." });
    }

    const result = await pool.query(
      `SELECT c.id, c.name, c.code, c.description, c.teacher_id, c.student_count, c.assignment_count, c.created_at,
              u.name AS teacher_name, u.profile_image_url AS teacher_profile_image_url
       FROM classes c
       INNER JOIN users u ON u.id = c.teacher_id
       WHERE c.teacher_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.id],
    );

    return res.status(200).json({ classes: result.rows });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load classes.",
      error: error.message,
    });
  }
});

router.get("/notifications", protect, async (req, res) => {
  try {
    const role = req.user.role;

    if (role !== "teacher" && role !== "student") {
      return res
        .status(400)
        .json({ message: "Invalid user role for notifications." });
    }

    await ensureUpcomingDeadlineNotifications(req.user);

    const result = await pool.query(
      `SELECT n.id, n.type, n.severity, n.title, n.message,
              n.class_id, c.name AS class_name,
              n.activity_id, a.title AS activity_title, a.due_date,
              n.related_submission_id, n.status, n.read_at, n.created_at
       FROM notifications n
       LEFT JOIN classes c ON c.id = n.class_id
       LEFT JOIN activities a ON a.id = n.activity_id
       WHERE n.user_id = $1
         AND n.receiver_role = $2
         AND ($2 <> 'teacher' OR n.type = 'new_submission')
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 100`,
      [req.user.id, role],
    );

    const notifications = result.rows.map((notification) => ({
      id: String(notification.id),
      type: normalizeNotificationType(notification.type),
      severity: notification.severity === "warning" ? "warning" : "info",
      classId: notification.class_id ? String(notification.class_id) : "",
      className: notification.class_name ?? "Unknown class",
      activityId: notification.activity_id ? String(notification.activity_id) : "",
      activityTitle: notification.activity_title ?? "Activity unavailable",
      title: notification.title,
      message: notification.message,
      eventAt:
        toISOStringOrNull(notification.created_at) ?? new Date().toISOString(),
      dueDate: toISOStringOrNull(notification.due_date),
      createdAt: toISOStringOrNull(notification.created_at),
      status: normalizeNotificationStatus(notification.status),
      readAt: toISOStringOrNull(notification.read_at),
      relatedSubmissionId: notification.related_submission_id
        ? String(notification.related_submission_id)
        : null,
    }));

    return res.status(200).json({ notifications });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load notifications.",
      error: error.message,
    });
  }
});

router.patch("/notifications/:notificationId/read", protect, async (req, res) => {
  try {
    const notificationId = Number(req.params.notificationId);

    if (!Number.isFinite(notificationId)) {
      return res.status(400).json({ message: "Invalid notification id." });
    }

    const result = await pool.query(
      `UPDATE notifications
       SET status = 'read', read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Notification not found." });
    }

    return res.status(200).json({ message: "Notification marked as read." });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update notification.",
      error: error.message,
    });
  }
});

router.delete("/notifications/:notificationId", protect, async (req, res) => {
  try {
    const notificationId = Number(req.params.notificationId);

    if (!Number.isFinite(notificationId)) {
      return res.status(400).json({ message: "Invalid notification id." });
    }

    const result = await pool.query(
      "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
      [notificationId, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Notification not found." });
    }

    return res.status(200).json({ message: "Notification deleted." });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete notification.",
      error: error.message,
    });
  }
});

router.get("/teacher/overview", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can view this overview." });
    }

    const [classesResult, activitiesResult, enrollmentsResult] =
      await Promise.all([
        pool.query(
          `SELECT c.id, c.name, c.code, c.description, c.teacher_id, c.student_count, c.assignment_count, c.created_at,
                u.name AS teacher_name, u.profile_image_url AS teacher_profile_image_url
         FROM classes c
         INNER JOIN users u ON u.id = c.teacher_id
         WHERE c.teacher_id = $1
         ORDER BY c.created_at DESC`,
          [req.user.id],
        ),
        pool.query(
          `SELECT a.id, a.class_id, c.name AS class_name,
                a.title, a.instructor, a.description, a.submission_type,
                a.allow_resubmission, a.max_score, a.programming_language,
                a.starter_code, a.attachment_name, a.attachment_type,
                a.attachment_size, a.due_date, a.created_at,
                COALESCE((SELECT COUNT(*) FROM submissions s WHERE s.activity_id = a.id), 0)::int AS submission_count
         FROM activities a
         INNER JOIN classes c ON c.id = a.class_id
         WHERE c.teacher_id = $1
         ORDER BY a.created_at DESC`,
          [req.user.id],
        ),
        pool.query(
          `SELECT ce.class_id, ce.joined_at, u.id, u.name, u.email, u.profile_image_url,
                COALESCE((
                  SELECT COUNT(*)
                  FROM submissions s
                  INNER JOIN activities a ON a.id = s.activity_id
                  WHERE a.class_id = ce.class_id AND s.student_id = u.id
                ), 0)::int AS submission_count
         FROM class_enrollments ce
         INNER JOIN classes c ON c.id = ce.class_id
         INNER JOIN users u ON u.id = ce.student_id
         WHERE c.teacher_id = $1
         ORDER BY ce.joined_at ASC`,
          [req.user.id],
        ),
      ]);

    const dedupedStudents = new Map();

    for (const enrollment of enrollmentsResult.rows) {
      const key = getStudentIdentityKey(enrollment.name, enrollment.email);
      const joinedAt = enrollment.joined_at;

      if (!dedupedStudents.has(key)) {
        dedupedStudents.set(key, {
          id: enrollment.id,
          name: enrollment.name,
          email: enrollment.email,
          profile_image_url: enrollment.profile_image_url ?? null,
          first_joined_at: joinedAt,
          last_joined_at: joinedAt,
          submission_count: Number(enrollment.submission_count ?? 0),
          class_ids: new Set([Number(enrollment.class_id)]),
        });

        continue;
      }

      const existing = dedupedStudents.get(key);
      existing.class_ids.add(Number(enrollment.class_id));
      existing.submission_count += Number(enrollment.submission_count ?? 0);

      if (
        new Date(joinedAt).getTime() <
        new Date(existing.first_joined_at).getTime()
      ) {
        existing.first_joined_at = joinedAt;
      }

      if (
        new Date(joinedAt).getTime() >
        new Date(existing.last_joined_at).getTime()
      ) {
        existing.last_joined_at = joinedAt;
      }

      // Prefer any available profile image from duplicate records.
      if (!existing.profile_image_url && enrollment.profile_image_url) {
        existing.profile_image_url = enrollment.profile_image_url;
      }
    }

    const students = Array.from(dedupedStudents.values())
      .map((student) => ({
        id: student.id,
        name: student.name,
        email: student.email,
        profile_image_url: student.profile_image_url,
        first_joined_at: student.first_joined_at,
        last_joined_at: student.last_joined_at,
        class_count: student.class_ids.size,
        submission_count: student.submission_count,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    const now = Date.now();
    const upcoming = [...activitiesResult.rows]
      .filter((activity) => new Date(activity.due_date).getTime() >= now)
      .sort(
        (left, right) =>
          new Date(left.due_date).getTime() -
          new Date(right.due_date).getTime(),
      );

    return res.status(200).json({
      classes: classesResult.rows,
      students,
      activities: activitiesResult.rows,
      upcoming,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load teacher overview.",
      error: error.message,
    });
  }
});

router.get("/teacher/analytics", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({
        message: "Only teachers can view analytics.",
      });
    }

    const submissionResult = await pool.query(
      `SELECT s.ai_probability, s.submitted_at, c.id AS class_id, c.name AS class_name
       FROM submissions s
       INNER JOIN activities a ON a.id = s.activity_id
       INNER JOIN classes c ON c.id = a.class_id
       WHERE c.teacher_id = $1
       ORDER BY s.submitted_at ASC`,
      [req.user.id],
    );

    const classStatsMap = new Map();
    const analyzedIntegrityScores = [];
    const monthBuckets = buildRecentMonthBuckets(6);
    const monthBucketMap = new Map(
      monthBuckets.map((bucket) => [bucket.key, bucket]),
    );

    for (const row of submissionResult.rows) {
      const classId = Number(row.class_id);
      if (!Number.isFinite(classId)) {
        continue;
      }

      const className = row.class_name ?? "Unknown Class";
      const aiProbability = getNumericCandidate(row.ai_probability);
      const isFlagged = aiProbability !== null && aiProbability >= 60;

      if (!classStatsMap.has(classId)) {
        classStatsMap.set(classId, {
          classId: String(classId),
          className,
          submissions: 0,
          flaggedOutputs: 0,
          aiProbabilities: [],
          integrityScores: [],
        });
      }

      const classStats = classStatsMap.get(classId);
      classStats.submissions += 1;

      if (isFlagged) {
        classStats.flaggedOutputs += 1;
      }

      if (aiProbability !== null) {
        classStats.aiProbabilities.push(aiProbability);
        const integrityScore = Number((100 - aiProbability).toFixed(2));
        classStats.integrityScores.push(integrityScore);
        analyzedIntegrityScores.push(integrityScore);
      }

      const submittedAt = new Date(row.submitted_at);
      if (Number.isFinite(submittedAt.getTime())) {
        const key = monthKeyFromDate(submittedAt);
        const monthBucket = monthBucketMap.get(key);

        if (monthBucket) {
          monthBucket.submissions += 1;

          if (isFlagged) {
            monthBucket.flaggedOutputs += 1;
          }

          if (aiProbability !== null) {
            monthBucket.integrityScores.push(
              Number((100 - aiProbability).toFixed(2)),
            );
          }
        }
      }
    }

    const allClassAnalytics = Array.from(classStatsMap.values()).map(
      (entry) => {
        const averageAiProbability = average(entry.aiProbabilities);
        const averageIntegrityScore = average(entry.integrityScores);
        const flaggedRate = entry.submissions
          ? (entry.flaggedOutputs / entry.submissions) * 100
          : 0;

        return {
          classId: entry.classId,
          className: entry.className,
          submissions: entry.submissions,
          flaggedOutputs: entry.flaggedOutputs,
          averageAiProbability,
          averageIntegrityScore,
          suspicionIndex: Number(
            ((averageAiProbability ?? 0) * 0.7 + flaggedRate * 0.3).toFixed(2),
          ),
        };
      },
    );

    const topSuspiciousClasses = [...allClassAnalytics]
      .sort((left, right) => {
        if (right.suspicionIndex !== left.suspicionIndex) {
          return right.suspicionIndex - left.suspicionIndex;
        }

        if (right.flaggedOutputs !== left.flaggedOutputs) {
          return right.flaggedOutputs - left.flaggedOutputs;
        }

        return right.submissions - left.submissions;
      })
      .slice(0, 5)
      .map(({ suspicionIndex, ...rest }) => rest);

    const monthlyTrends = monthBuckets.map((bucket) => ({
      month: bucket.month,
      monthKey: bucket.key,
      submissions: bucket.submissions,
      flaggedOutputs: bucket.flaggedOutputs,
      averageIntegrityScore: average(bucket.integrityScores),
    }));

    const flaggedOutputs = allClassAnalytics.reduce(
      (sum, classMetric) => sum + classMetric.flaggedOutputs,
      0,
    );

    return res.status(200).json({
      totals: {
        totalSubmissions: submissionResult.rows.length,
        flaggedOutputs,
        averageIntegrityScore: average(analyzedIntegrityScores),
      },
      topSuspiciousClasses,
      monthlyTrends,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load teacher analytics.",
      error: error.message,
    });
  }
});

router.post("/", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can create classes." });
    }

    const { name, code, description } = req.body;

    if (!name || !code || !description) {
      return res
        .status(400)
        .json({ message: "Please provide name, code, and description." });
    }

    const insert = await pool.query(
      `INSERT INTO classes (name, code, description, teacher_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, code, description, teacher_id, student_count, assignment_count, created_at`,
      [name, String(code).toUpperCase(), description, req.user.id],
    );

    return res.status(201).json({
      message: "Class created successfully.",
      class: insert.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Class code already exists." });
    }

    return res.status(500).json({
      message: "Failed to create class.",
      error: error.message,
    });
  }
});

router.post("/join/lookup", protect, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res
        .status(403)
        .json({ message: "Only students can validate class codes." });
    }

    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: "Class code is required." });
    }

    const classResult = await pool.query(
      `SELECT c.id, c.name, c.code, c.description, c.teacher_id, c.student_count, c.assignment_count, c.created_at,
              u.name AS teacher_name, u.profile_image_url AS teacher_profile_image_url
       FROM classes c
       INNER JOIN users u ON u.id = c.teacher_id
       WHERE UPPER(c.code) = UPPER($1)
       LIMIT 1`,
      [code],
    );

    if (classResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Class not found for the provided code." });
    }

    const classroom = classResult.rows[0];

    const enrollment = await pool.query(
      `SELECT id, joined_at
       FROM class_enrollments
       WHERE class_id = $1 AND student_id = $2
       LIMIT 1`,
      [classroom.id, req.user.id],
    );

    const requestResult = await pool.query(
      `SELECT id, status, rejection_note, submitted_at, reviewed_at
       FROM class_enrollment_requests
       WHERE class_id = $1 AND student_id = $2
       ORDER BY submitted_at DESC
       LIMIT 1`,
      [classroom.id, req.user.id],
    );

    return res.status(200).json({
      class: classroom,
      enrollment: enrollment.rows[0] ?? null,
      request: requestResult.rows[0] ?? null,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to validate class code.",
      error: error.message,
    });
  }
});

router.post("/join", protect, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res
        .status(403)
        .json({ message: "Only students can join classes." });
    }

    const {
      code,
      corFileName,
      corFileType,
      corFileSize,
      corDataUrl,
    } = req.body;

    if (!code) {
      return res.status(400).json({ message: "Class code is required." });
    }

    const corUpload = normalizeCorUpload({
      fileName: corFileName,
      fileType: corFileType,
      fileSize: corFileSize,
      fileDataUrl: corDataUrl,
    });

    const classResult = await pool.query(
      `SELECT c.id, c.name, c.code, c.description, c.teacher_id, c.student_count, c.assignment_count, c.created_at,
              u.name AS teacher_name, u.profile_image_url AS teacher_profile_image_url
       FROM classes c
       INNER JOIN users u ON u.id = c.teacher_id
       WHERE UPPER(c.code) = UPPER($1)
       LIMIT 1`,
      [code],
    );

    if (classResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Class not found for the provided code." });
    }

    const classroom = classResult.rows[0];

    const enrollment = await pool.query(
      `SELECT id FROM class_enrollments WHERE class_id = $1 AND student_id = $2`,
      [classroom.id, req.user.id],
    );

    if (enrollment.rows.length > 0) {
      return res.status(409).json({
        message: "You are already enrolled in this class.",
      });
    }

    const activeRequest = await pool.query(
      `SELECT id, status, submitted_at
       FROM class_enrollment_requests
       WHERE class_id = $1 AND student_id = $2 AND status = 'pending'
       LIMIT 1`,
      [classroom.id, req.user.id],
    );

    if (activeRequest.rows.length > 0) {
      return res.status(409).json({
        message: "You already have a pending enrollment request for this class.",
        request: activeRequest.rows[0],
      });
    }

    const request = await pool.query(
      `INSERT INTO class_enrollment_requests (
         class_id, student_id, status, cor_file_name, cor_file_type,
         cor_file_size, cor_data_url
       )
       VALUES ($1, $2, 'pending', $3, $4, $5, $6)
       RETURNING id, class_id, student_id, status, cor_file_name, cor_file_type,
                 cor_file_size, rejection_note, submitted_at, reviewed_at`,
      [
        classroom.id,
        req.user.id,
        corUpload.fileName,
        corUpload.fileType,
        corUpload.fileSize,
        corUpload.fileDataUrl,
      ],
    );

    return res.status(202).json({
      message: "Enrollment request submitted for teacher review.",
      class: classroom,
      request: request.rows[0],
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    if (error.code === "23505") {
      return res.status(409).json({
        message: "You already have a pending enrollment request for this class.",
      });
    }

    return res.status(500).json({
      message: "Failed to submit enrollment request.",
      error: error.message,
    });
  }
});

router.get("/enrolled", protect, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res
        .status(403)
        .json({ message: "Only students can view enrolled classes." });
    }

    const result = await pool.query(
      `SELECT c.id, c.name, c.code, c.description, c.teacher_id, c.student_count, c.assignment_count, c.created_at,
              ce.joined_at, u.name AS teacher_name, u.profile_image_url AS teacher_profile_image_url
       FROM class_enrollments ce
       INNER JOIN classes c ON c.id = ce.class_id
       INNER JOIN users u ON u.id = c.teacher_id
       WHERE ce.student_id = $1
       ORDER BY ce.joined_at DESC`,
      [req.user.id],
    );

    return res.status(200).json({ classes: result.rows });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load enrolled classes.",
      error: error.message,
    });
  }
});

router.get("/enrollment-requests/mine", protect, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res
        .status(403)
        .json({ message: "Only students can view enrollment requests." });
    }

    const result = await pool.query(
      `SELECT cer.id, cer.class_id, cer.student_id, cer.status,
              cer.cor_file_name, cer.cor_file_type, cer.cor_file_size,
              cer.rejection_note, cer.submitted_at, cer.reviewed_at,
              c.name AS class_name, c.code AS class_code,
              u.name AS teacher_name, u.profile_image_url AS teacher_profile_image_url
       FROM class_enrollment_requests cer
       INNER JOIN classes c ON c.id = cer.class_id
       INNER JOIN users u ON u.id = c.teacher_id
       WHERE cer.student_id = $1
       ORDER BY cer.submitted_at DESC`,
      [req.user.id],
    );

    return res.status(200).json({ requests: result.rows });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load enrollment requests.",
      error: error.message,
    });
  }
});

router.get("/enrollment-requests", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can review enrollment requests." });
    }

    const result = await pool.query(
      `SELECT cer.id, cer.class_id, cer.student_id, cer.status,
              cer.cor_file_name, cer.cor_file_type, cer.cor_file_size,
              cer.cor_data_url, cer.rejection_note, cer.submitted_at,
              cer.reviewed_at, cer.reviewed_by,
              c.name AS class_name, c.code AS class_code,
              s.name AS student_name, s.email AS student_email,
              s.profile_image_url AS student_profile_image_url
       FROM class_enrollment_requests cer
       INNER JOIN classes c ON c.id = cer.class_id
       INNER JOIN users s ON s.id = cer.student_id
       WHERE c.teacher_id = $1
       ORDER BY
         CASE cer.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
         cer.submitted_at DESC`,
      [req.user.id],
    );

    return res.status(200).json({ requests: result.rows });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load enrollment requests.",
      error: error.message,
    });
  }
});

router.patch("/enrollment-requests/:requestId", protect, async (req, res) => {
  const client = await pool.connect();

  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can review enrollment requests." });
    }

    const requestId = Number(req.params.requestId);

    if (!Number.isFinite(requestId)) {
      return res.status(400).json({ message: "Invalid enrollment request id." });
    }

    const nextStatus = asTrimmedString(req.body.status).toLowerCase();
    const rejectionNote = asTrimmedString(req.body.rejectionNote) || null;

    if (
      !ENROLLMENT_REQUEST_STATUSES.has(nextStatus) ||
      nextStatus === "pending"
    ) {
      return res
        .status(400)
        .json({ message: "Enrollment request status must be accepted or rejected." });
    }

    await client.query("BEGIN");

    const requestResult = await client.query(
      `SELECT cer.id, cer.class_id, cer.student_id, cer.status,
              c.teacher_id
       FROM class_enrollment_requests cer
       INNER JOIN classes c ON c.id = cer.class_id
       WHERE cer.id = $1
       FOR UPDATE`,
      [requestId],
    );

    const enrollmentRequest = requestResult.rows[0];

    if (!enrollmentRequest || Number(enrollmentRequest.teacher_id) !== Number(req.user.id)) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "Enrollment request not found in your classes." });
    }

    if (enrollmentRequest.status !== "pending") {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ message: "This enrollment request has already been reviewed." });
    }

    const reviewed = await client.query(
      `UPDATE class_enrollment_requests
       SET status = $2,
           rejection_note = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END,
           reviewed_by = $4,
           reviewed_at = NOW()
       WHERE id = $1
       RETURNING id, class_id, student_id, status, cor_file_name, cor_file_type,
                 cor_file_size, cor_data_url, rejection_note, reviewed_by,
                 submitted_at, reviewed_at`,
      [requestId, nextStatus, rejectionNote, req.user.id],
    );

    let membershipCreated = false;

    if (nextStatus === "accepted") {
      const insertedEnrollment = await client.query(
        `INSERT INTO class_enrollments (class_id, student_id)
         VALUES ($1, $2)
         ON CONFLICT (class_id, student_id) DO NOTHING
         RETURNING id`,
        [enrollmentRequest.class_id, enrollmentRequest.student_id],
      );

      membershipCreated = insertedEnrollment.rows.length > 0;

      if (membershipCreated) {
        await client.query(
          `UPDATE classes
           SET student_count = student_count + 1
           WHERE id = $1`,
          [enrollmentRequest.class_id],
        );
      }
    }

    await client.query("COMMIT");

    return res.status(200).json({
      message:
        nextStatus === "accepted"
          ? "Enrollment request accepted."
          : "Enrollment request rejected.",
      request: reviewed.rows[0],
      membershipCreated,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return res.status(500).json({
      message: "Failed to update enrollment request.",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

router.get("/activities/:activityId", protect, async (req, res) => {
  try {
    const activityId = Number(req.params.activityId);

    if (!Number.isFinite(activityId)) {
      return res.status(400).json({ message: "Invalid activity id." });
    }

    const activityResult = await pool.query(
      `SELECT a.id, a.class_id, c.name AS class_name, c.code AS class_code,
              a.title, a.instructor, a.description, a.submission_type,
              a.allow_resubmission, a.max_score, a.programming_language,
              a.starter_code, a.attachment_name, a.attachment_type,
              a.attachment_size, a.due_date, a.created_at,
              u.name AS teacher_name, u.profile_image_url AS teacher_profile_image_url
       FROM activities a
       INNER JOIN classes c ON c.id = a.class_id
       INNER JOIN users u ON u.id = c.teacher_id
       WHERE a.id = $1
       LIMIT 1`,
      [activityId],
    );

    if (activityResult.rows.length === 0) {
      return res.status(404).json({ message: "Activity not found." });
    }

    const activity = activityResult.rows[0];
    const classroom = await getAccessibleClass(activity.class_id, req.user);

    if (!classroom) {
      return res
        .status(403)
        .json({ message: "You do not have access to this activity." });
    }

    let submission = null;
    let history = [];

    if (req.user.role === "student") {
      const submissionResult = await pool.query(
        `SELECT id, activity_id, student_id, content_text, file_name, file_type,
                file_size, status, ai_probability, is_ai_generated,
                analysis_details, submitted_version, teacher_comments,
                teacher_remarks, teacher_grade, teacher_score, evaluated_at,
                submitted_at, updated_at
         FROM submissions
         WHERE activity_id = $1 AND student_id = $2
         LIMIT 1`,
        [activityId, req.user.id],
      );

      submission = sanitizeStudentSubmission(submissionResult.rows[0] ?? null);

      const historyResult = await pool.query(
        `SELECT id, submission_id, activity_id, student_id, version, content_text,
                file_name, file_type, file_size, status, submitted_at
         FROM submission_history
         WHERE activity_id = $1 AND student_id = $2
         ORDER BY version DESC, submitted_at DESC`,
        [activityId, req.user.id],
      );

      history = historyResult.rows;

      if (history.length === 0 && submission) {
        history = [
          {
            id: submission.id,
            submission_id: submission.id,
            activity_id: submission.activity_id,
            student_id: submission.student_id,
            version: submission.submitted_version ?? 1,
            content_text: submission.content_text,
            file_name: submission.file_name,
            file_type: submission.file_type,
            file_size: submission.file_size,
            status: submission.status,
            submitted_at: submission.submitted_at,
          },
        ];
      }
    }

    return res.status(200).json({
      activity,
      submission,
      history,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load activity.",
      error: error.message,
    });
  }
});

router.get(
  "/documents/:documentType/:documentId",
  protect,
  async (req, res) => {
    try {
      const { documentType } = req.params;
      const documentId = Number(req.params.documentId);

      if (!Number.isFinite(documentId)) {
        return res.status(400).json({ message: "Invalid document id." });
      }

      if (documentType === "activity-attachment") {
        const activityResult = await pool.query(
          `SELECT a.id, a.class_id, c.name AS class_name, a.title AS activity_title,
                a.attachment_name, a.attachment_type, a.attachment_size,
                a.attachment_data_url, a.created_at
         FROM activities a
         INNER JOIN classes c ON c.id = a.class_id
         WHERE a.id = $1
         LIMIT 1`,
          [documentId],
        );

        if (activityResult.rows.length === 0) {
          return res
            .status(404)
            .json({ message: "Activity attachment not found." });
        }

        const activity = activityResult.rows[0];
        const classroom = await getAccessibleClass(activity.class_id, req.user);

        if (!classroom) {
          return res
            .status(403)
            .json({ message: "You do not have access to this document." });
        }

        if (!activity.attachment_name) {
          return res
            .status(404)
            .json({ message: "This activity has no attachment." });
        }

        return res.status(200).json({
          document: {
            id: String(activity.id),
            kind: "activity-attachment",
            title: activity.activity_title,
            className: activity.class_name,
            fileName: activity.attachment_name,
            fileType: activity.attachment_type,
            fileSize: activity.attachment_size,
            dataUrl: activity.attachment_data_url,
            textContent: null,
            createdAt: activity.created_at,
            submittedAt: null,
            ownerName: null,
          },
        });
      }

      if (documentType === "submission") {
        const submissionResult = await pool.query(
          `SELECT s.id, s.activity_id, a.class_id, c.name AS class_name,
                a.title AS activity_title, s.student_id, u.name AS student_name,
                s.content_text, s.file_name, s.file_type, s.file_size,
                s.file_data_url, s.status, s.submitted_at, s.updated_at
         FROM submissions s
         INNER JOIN activities a ON a.id = s.activity_id
         INNER JOIN classes c ON c.id = a.class_id
         INNER JOIN users u ON u.id = s.student_id
         WHERE s.id = $1
         LIMIT 1`,
          [documentId],
        );

        if (submissionResult.rows.length === 0) {
          return res
            .status(404)
            .json({ message: "Submission document not found." });
        }

        const submission = submissionResult.rows[0];
        const teacherCanView =
          req.user.role === "teacher" &&
          (await getAccessibleClass(submission.class_id, req.user));
        const studentCanView =
          req.user.role === "student" &&
          Number(submission.student_id) === Number(req.user.id);

        if (!teacherCanView && !studentCanView) {
          return res
            .status(403)
            .json({ message: "You do not have access to this document." });
        }

        return res.status(200).json({
          document: {
            id: String(submission.id),
            kind: "submission",
            title: submission.activity_title,
            className: submission.class_name,
            fileName:
              submission.file_name ?? `${submission.activity_title} essay`,
            fileType: submission.file_type ?? "text/plain",
            fileSize: submission.file_size,
            dataUrl: submission.file_data_url,
            textContent: submission.content_text,
            status: submission.status,
            createdAt: submission.updated_at,
            submittedAt: submission.submitted_at,
            ownerName: submission.student_name,
          },
        });
      }

      return res.status(404).json({ message: "Document type not found." });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load document.",
        error: error.message,
      });
    }
  },
);

router.get("/:classId/activities", protect, async (req, res) => {
  try {
    const classId = Number(req.params.classId);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "Invalid class id." });
    }

    const classroom = await getAccessibleClass(classId, req.user);

    if (!classroom) {
      return res
        .status(403)
        .json({ message: "You do not have access to this class." });
    }

    if (req.user.role === "student") {
      const result = await pool.query(
        `SELECT a.id, a.class_id, a.title, a.instructor, a.description, a.submission_type,
                a.allow_resubmission, a.max_score, a.programming_language,
                a.starter_code, a.attachment_name, a.attachment_type,
                a.attachment_size, a.due_date, a.created_at,
                s.id AS submission_id,
                CASE WHEN s.status = 'analyzed' THEN 'Analyzed' ELSE 'Pending' END AS submission_status,
                s.ai_probability, s.is_ai_generated, s.analysis_details,
                s.teacher_comments, s.teacher_remarks, s.teacher_grade,
                s.teacher_score, s.evaluated_at, s.submitted_at, s.updated_at,
                s.content_text, s.file_name, s.file_type, s.file_size,
                s.submitted_version
         FROM activities a
         LEFT JOIN submissions s ON s.activity_id = a.id AND s.student_id = $2
         WHERE a.class_id = $1
         ORDER BY a.due_date ASC`,
        [classId, req.user.id],
      );

      return res.status(200).json({ activities: result.rows });
    }

    const result = await pool.query(
      `SELECT a.id, a.class_id, a.title, a.instructor, a.description, a.submission_type,
              a.allow_resubmission, a.max_score, a.programming_language,
              a.starter_code, a.attachment_name, a.attachment_type, a.attachment_size,
              a.due_date, a.created_at,
              COALESCE((SELECT COUNT(*) FROM submissions s WHERE s.activity_id = a.id), 0)::int AS submission_count
       FROM activities a
       WHERE a.class_id = $1
       ORDER BY a.created_at DESC`,
      [classId],
    );

    return res.status(200).json({ activities: result.rows });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load activities.",
      error: error.message,
    });
  }
});

router.post("/:classId/activities", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can create activities." });
    }

    const classId = Number(req.params.classId);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "Invalid class id." });
    }

    const classroom = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, req.user.id],
    );

    if (classroom.rows.length === 0) {
      return res.status(403).json({ message: "You do not own this class." });
    }

    const {
      title,
      instructor,
      description,
      submissionType,
      dueDate,
      allowResubmission,
      maxScore,
      programmingLanguage,
      starterCode,
      attachmentName,
      attachmentType,
      attachmentSize,
      attachmentDataUrl,
    } = req.body;

    if (!title || !instructor || !description || !submissionType || !dueDate) {
      return res.status(400).json({
        message:
          "Please provide title, instructor, description, submission type, and due date.",
      });
    }

    const normalizedSubmissionType = String(submissionType).toLowerCase();

    if (!ACTIVITY_SUBMISSION_TYPES.has(normalizedSubmissionType)) {
      return res
        .status(400)
        .json({ message: "Submission type must be essay, file, image, or code." });
    }

    const normalizedMaxScore = normalizeAcademicScore(maxScore ?? 100, 10000);

    if (!normalizedMaxScore || normalizedMaxScore <= 0) {
      return res
        .status(400)
        .json({ message: "Maximum score must be greater than 0." });
    }

    const normalizedLanguage =
      normalizedSubmissionType === "code"
        ? asTrimmedString(programmingLanguage) || "Plain text"
        : null;
    const normalizedStarterCode =
      normalizedSubmissionType === "code"
        ? asTrimmedString(starterCode) || null
        : null;

    const attachment = normalizeDocumentUpload({
      fileName: attachmentName,
      fileType: attachmentType,
      fileSize: attachmentSize,
      fileDataUrl: attachmentDataUrl,
    });

    const canResubmit =
      typeof allowResubmission === "boolean" ? allowResubmission : true;

    const insert = await pool.query(
      `INSERT INTO activities (
         class_id, title, instructor, description, submission_type,
         allow_resubmission, max_score, programming_language, starter_code,
         attachment_name, attachment_type, attachment_size, attachment_data_url,
         due_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, class_id, title, instructor, description, submission_type,
                 allow_resubmission, max_score, programming_language, starter_code,
                 attachment_name, attachment_type, attachment_size, due_date,
                 created_at`,
      [
        classId,
        title,
        instructor,
        description,
        normalizedSubmissionType,
        canResubmit,
        normalizedMaxScore,
        normalizedLanguage,
        normalizedStarterCode,
        attachment.fileName,
        attachment.fileType,
        attachment.fileSize,
        attachment.fileDataUrl,
        dueDate,
      ],
    );

    await pool.query(
      "UPDATE classes SET assignment_count = assignment_count + 1 WHERE id = $1",
      [classId],
    );

    await createActivityNotifications(insert.rows[0].id);

    return res.status(201).json({
      message: "Activity created successfully.",
      activity: insert.rows[0],
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Failed to create activity.",
      error: error.message,
    });
  }
});

router.post(
  "/activities/:activityId/submissions",
  protect,
  async (req, res) => {
    try {
      if (req.user.role !== "student") {
        return res
          .status(403)
          .json({ message: "Only students can submit activities." });
      }

      const activityId = Number(req.params.activityId);

      if (!Number.isFinite(activityId)) {
        return res.status(400).json({ message: "Invalid activity id." });
      }

      const activityResult = await pool.query(
        `SELECT a.id, a.class_id, a.submission_type, a.allow_resubmission
       FROM activities a
       WHERE a.id = $1`,
        [activityId],
      );

      if (activityResult.rows.length === 0) {
        return res.status(404).json({ message: "Activity not found." });
      }

      const activity = activityResult.rows[0];

      const enrollment = await pool.query(
        `SELECT id FROM class_enrollments WHERE class_id = $1 AND student_id = $2`,
        [activity.class_id, req.user.id],
      );

      if (enrollment.rows.length === 0) {
        return res
          .status(403)
          .json({ message: "You are not enrolled in this class." });
      }

      const {
        contentText,
        fileName,
        fileType,
        fileSize,
        fileDataUrl,
        extractedText,
      } = req.body;

      const rawTextContent = typeof contentText === "string" ? contentText : "";
      const trimmedTextContent = rawTextContent.trim();
      const hasTypedContent = Boolean(trimmedTextContent);
      const textOnlySubmissionTypes = ["essay", "code"];
      const submittedTextContent =
        activity.submission_type === "code" ? rawTextContent : trimmedTextContent;
      const hasExtractedText =
        typeof extractedText === "string" && Boolean(extractedText.trim());
      const hasSubmittedUpload = hasUploadPayload({
        fileName,
        fileType,
        fileSize,
        fileDataUrl,
      });

      if (textOnlySubmissionTypes.includes(activity.submission_type) && !hasTypedContent) {
        return res
          .status(400)
          .json({
            message:
              activity.submission_type === "code"
                ? "Code submissions require code content."
                : "Essay submissions require text content.",
          });
      }

      if (
        textOnlySubmissionTypes.includes(activity.submission_type) &&
        (hasSubmittedUpload || hasExtractedText)
      ) {
        return res.status(400).json({
          message:
            activity.submission_type === "code"
              ? "Code activities only accept typed code."
              : "Essay activities only accept typed essay text.",
        });
      }

      if (
        ["file", "image"].includes(activity.submission_type) &&
        (hasTypedContent || hasExtractedText)
      ) {
        return res.status(400).json({
          message:
            activity.submission_type === "file"
              ? "File activities only accept document uploads."
              : "Image activities only accept image uploads.",
        });
      }

      if (
        ["file", "image"].includes(activity.submission_type) &&
        !fileName?.trim()
      ) {
        return res
          .status(400)
          .json({
            message:
              activity.submission_type === "file"
                ? "File submissions require a PDF or DOCX file."
                : "Image submissions require an image file.",
          });
      }

      const upload = normalizeDocumentUpload({
        fileName,
        fileType,
        fileSize,
        fileDataUrl,
      });

      if (
        ["file", "image"].includes(activity.submission_type) &&
        (!upload.fileName || !upload.fileDataUrl)
      ) {
        return res
          .status(400)
          .json({
            message:
              activity.submission_type === "file"
                ? "File submissions require a valid PDF or DOCX file."
                : "Image submissions require a valid image file.",
          });
      }

      if (
        ["file", "image"].includes(activity.submission_type) &&
        !isAllowedSubmissionUpload(
          activity.submission_type,
          upload.fileName,
          upload.fileType,
        )
      ) {
        return res.status(415).json({
          message:
            activity.submission_type === "file"
              ? "File activities only accept PDF or DOCX documents."
              : "Image activities only accept PNG, JPG, JPEG, or WEBP images.",
        });
      }

      const existingSubmission = await pool.query(
        `SELECT id, submitted_version
       FROM submissions
       WHERE activity_id = $1 AND student_id = $2
       LIMIT 1`,
        [activityId, req.user.id],
      );

      if (
        existingSubmission.rows.length > 0 &&
        activity.allow_resubmission === false
      ) {
        return res.status(409).json({
          message: "Resubmission is not allowed for this activity.",
        });
      }

      const nextVersion =
        existingSubmission.rows.length > 0
          ? Number(existingSubmission.rows[0].submitted_version ?? 1) + 1
          : 1;

      const submission = await pool.query(
        `INSERT INTO submissions (
         activity_id, student_id, content_text, file_name, file_type,
          file_size, file_data_url, submitted_version
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (activity_id, student_id)
       DO UPDATE SET
         content_text = EXCLUDED.content_text,
         file_name = EXCLUDED.file_name,
         file_type = EXCLUDED.file_type,
         file_size = EXCLUDED.file_size,
         file_data_url = EXCLUDED.file_data_url,
         status = 'pending',
          ai_probability = NULL,
          is_ai_generated = NULL,
          analysis_details = NULL,
          teacher_comments = NULL,
          teacher_remarks = NULL,
          teacher_grade = NULL,
          teacher_score = NULL,
          evaluated_by = NULL,
          evaluated_at = NULL,
          submitted_version = EXCLUDED.submitted_version,
          submitted_at = NOW(),
          updated_at = NOW()
      RETURNING id, activity_id, student_id, content_text, file_name, file_type,
                 file_size, status, ai_probability, is_ai_generated,
                 analysis_details, submitted_version, teacher_comments,
                 teacher_remarks, teacher_grade, teacher_score, evaluated_at,
                 submitted_at, updated_at`,
        [
          activityId,
          req.user.id,
          textOnlySubmissionTypes.includes(activity.submission_type)
            ? submittedTextContent
            : null,
          upload.fileName,
          upload.fileType,
          upload.fileSize,
          upload.fileDataUrl,
          nextVersion,
        ],
      );

      await pool.query(
        `INSERT INTO submission_history (
         submission_id, activity_id, student_id, version, content_text,
         file_name, file_type, file_size, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          submission.rows[0].id,
          activityId,
          req.user.id,
          nextVersion,
          textOnlySubmissionTypes.includes(activity.submission_type)
            ? submittedTextContent
            : null,
          upload.fileName,
          upload.fileType,
          upload.fileSize,
          "pending",
        ],
      );

      await createSubmissionNotification(submission.rows[0].id);

      return res.status(200).json({
        message: "Submission saved successfully.",
        submission: sanitizeStudentSubmission(submission.rows[0]),
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }

      return res.status(500).json({
        message: "Failed to submit activity.",
        error: error.message,
      });
    }
  },
);

router.delete(
  "/activities/:activityId/submissions",
  protect,
  async (req, res) => {
    try {
      if (req.user.role !== "student") {
        return res
          .status(403)
          .json({ message: "Only students can unsubmit activities." });
      }

      const activityId = Number(req.params.activityId);

      if (!Number.isFinite(activityId)) {
        return res.status(400).json({ message: "Invalid activity id." });
      }

      const activityResult = await pool.query(
        `SELECT a.id, a.class_id, a.allow_resubmission
       FROM activities a
       WHERE a.id = $1`,
        [activityId],
      );

      if (activityResult.rows.length === 0) {
        return res.status(404).json({ message: "Activity not found." });
      }

      const enrollment = await pool.query(
        `SELECT id FROM class_enrollments WHERE class_id = $1 AND student_id = $2`,
        [activityResult.rows[0].class_id, req.user.id],
      );

      if (enrollment.rows.length === 0) {
        return res
          .status(403)
          .json({ message: "You are not enrolled in this class." });
      }

      if (activityResult.rows[0].allow_resubmission === false) {
        return res.status(409).json({
          message: "This activity is locked and cannot be unsubmitted.",
        });
      }

      const deleted = await pool.query(
        `DELETE FROM submissions
       WHERE activity_id = $1 AND student_id = $2
       RETURNING id`,
        [activityId, req.user.id],
      );

      if (deleted.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "No submitted work found to unsubmit." });
      }

      return res
        .status(200)
        .json({ message: "Submission removed successfully." });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to unsubmit activity.",
        error: error.message,
      });
    }
  },
);

router.get("/:classId/students", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can view enrolled students." });
    }

    const classId = Number(req.params.classId);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "Invalid class id." });
    }

    const classroom = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, req.user.id],
    );

    if (classroom.rows.length === 0) {
      return res.status(403).json({ message: "You do not own this class." });
    }

    const students = await pool.query(
      `SELECT u.id, u.name, u.email, u.profile_image_url, ce.joined_at,
              COALESCE((
                SELECT COUNT(*)
                FROM submissions s
                INNER JOIN activities a ON a.id = s.activity_id
                WHERE a.class_id = $1 AND s.student_id = u.id
              ), 0)::int AS submission_count
       FROM class_enrollments ce
       INNER JOIN users u ON u.id = ce.student_id
       WHERE ce.class_id = $1
       ORDER BY ce.joined_at ASC`,
      [classId],
    );

    return res.status(200).json({ students: students.rows });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load enrolled students.",
      error: error.message,
    });
  }
});

router.get("/:classId/submissions", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can view class submissions." });
    }

    const classId = Number(req.params.classId);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "Invalid class id." });
    }

    const classroom = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, req.user.id],
    );

    if (classroom.rows.length === 0) {
      return res.status(403).json({ message: "You do not own this class." });
    }

    const submissions = await pool.query(
      `SELECT s.id, s.activity_id, a.class_id, a.title AS activity_title,
              a.submission_type, a.max_score, a.programming_language,
              a.starter_code, a.due_date,
              s.student_id, u.name AS student_name, u.email AS student_email,
              s.content_text, s.file_name, s.file_type, s.file_size, s.file_data_url,
              s.status, s.ai_probability, s.is_ai_generated, s.analysis_details,
              s.submitted_version, s.teacher_comments, s.teacher_remarks,
              s.teacher_grade, s.teacher_score, s.evaluated_at,
              s.submitted_at, s.updated_at
       FROM submissions s
       INNER JOIN activities a ON a.id = s.activity_id
       INNER JOIN users u ON u.id = s.student_id
       WHERE a.class_id = $1
       ORDER BY s.submitted_at DESC`,
      [classId],
    );

    return res.status(200).json({ submissions: submissions.rows });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load submissions.",
      error: error.message,
    });
  }
});

router.get("/submissions/:submissionId", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can view submissions." });
    }

    const submissionId = Number(req.params.submissionId);

    if (!Number.isFinite(submissionId)) {
      return res.status(400).json({ message: "Invalid submission id." });
    }

    const submission = await pool.query(
      `SELECT s.id, s.activity_id, a.class_id, c.name AS class_name,
              a.title AS activity_title, a.submission_type, a.max_score,
              a.programming_language, a.starter_code, a.due_date,
              s.student_id, u.name AS student_name, u.email AS student_email,
              s.content_text, s.file_name, s.file_type, s.file_size, s.file_data_url,
              s.status, s.ai_probability, s.is_ai_generated, s.analysis_details,
              s.submitted_version, s.teacher_comments, s.teacher_remarks,
              s.teacher_grade, s.teacher_score, s.evaluated_at,
              s.submitted_at, s.updated_at
       FROM submissions s
       INNER JOIN activities a ON a.id = s.activity_id
       INNER JOIN classes c ON c.id = a.class_id
       INNER JOIN users u ON u.id = s.student_id
       WHERE s.id = $1 AND c.teacher_id = $2
       LIMIT 1`,
      [submissionId, req.user.id],
    );

    if (submission.rows.length === 0) {
      return res.status(404).json({
        message: "Submission not found or not accessible in your classes.",
      });
    }

    return res.status(200).json({ submission: submission.rows[0] });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load submission.",
      error: error.message,
    });
  }
});

router.patch("/submissions/:submissionId/evaluation", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can evaluate submissions." });
    }

    const submissionId = Number(req.params.submissionId);

    if (!Number.isFinite(submissionId)) {
      return res.status(400).json({ message: "Invalid submission id." });
    }

    const submissionResult = await pool.query(
      `SELECT s.id, a.max_score
       FROM submissions s
       INNER JOIN activities a ON a.id = s.activity_id
       INNER JOIN classes c ON c.id = a.class_id
       WHERE s.id = $1 AND c.teacher_id = $2
       LIMIT 1`,
      [submissionId, req.user.id],
    );

    if (submissionResult.rows.length === 0) {
      return res.status(404).json({
        message: "Submission not found or not accessible in your classes.",
      });
    }

    const maxScore = Number(submissionResult.rows[0].max_score ?? 100);
    const teacherComments = asTrimmedString(req.body.comments) || null;
    const teacherRemarks = asTrimmedString(req.body.remarks) || null;
    const teacherGrade = asTrimmedString(req.body.grade) || null;
    const teacherScore = normalizeAcademicScore(req.body.score, maxScore);

    const updated = await pool.query(
      `UPDATE submissions
       SET teacher_comments = $2,
           teacher_remarks = $3,
           teacher_grade = $4,
           teacher_score = $5,
           evaluated_by = $6,
           evaluated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, ai_probability, is_ai_generated, analysis_details,
                 teacher_comments, teacher_remarks, teacher_grade,
                 teacher_score, evaluated_at, updated_at`,
      [
        submissionId,
        teacherComments,
        teacherRemarks,
        teacherGrade,
        teacherScore,
        req.user.id,
      ],
    );

    return res.status(200).json({
      message: "Evaluation saved successfully.",
      submission: updated.rows[0],
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Failed to save evaluation.",
      error: error.message,
    });
  }
});

const analyzeSubmissionContent = async (submission) => {
  if (isImageSubmission(submission.file_name, submission.file_type)) {
    return analyzeImage(submission.file_data_url, submission.file_name);
  }

  const extractedText = await extractTextFromSubmissionFile({
    fileName: submission.file_name,
    fileType: submission.file_type,
    fileDataUrl: submission.file_data_url,
    contentText: submission.content_text,
  });

  return analyzeTextWithService(extractedText);
};

router.post("/submissions/:submissionId/analyze", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can analyze submissions." });
    }

    const submissionId = Number(req.params.submissionId);

    if (!Number.isFinite(submissionId)) {
      return res.status(400).json({ message: "Invalid submission id." });
    }

    const submissionResult = await pool.query(
      `SELECT s.id, s.content_text, s.file_name, s.file_type, s.file_data_url
       FROM submissions s
       INNER JOIN activities a ON a.id = s.activity_id
       INNER JOIN classes c ON c.id = a.class_id
       WHERE s.id = $1 AND c.teacher_id = $2
       LIMIT 1`,
      [submissionId, req.user.id],
    );

    if (submissionResult.rows.length === 0) {
      return res.status(404).json({
        message: "Submission not found or not accessible in your classes.",
      });
    }

    const submission = submissionResult.rows[0];
    const analysis = await analyzeSubmissionContent(submission);

    const updated = await pool.query(
      `UPDATE submissions
       SET status = 'analyzed',
           ai_probability = $2,
           is_ai_generated = $3,
           analysis_details = $4::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, ai_probability, is_ai_generated, analysis_details, updated_at`,
      [
        submission.id,
        analysis.aiProbability,
        analysis.isAIGenerated,
        JSON.stringify({
          ...analysis.details,
          fileName: submission.file_name ?? null,
        }),
      ],
    );

    return res.status(200).json({
      message: "Submission analyzed successfully.",
      submission: updated.rows[0],
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to analyze submission.",
      error: error.message,
    });
  }
});

router.post("/:classId/submissions/analyze", protect, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can analyze submissions." });
    }

    const classId = Number(req.params.classId);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "Invalid class id." });
    }

    const classroom = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, req.user.id],
    );

    if (classroom.rows.length === 0) {
      return res.status(403).json({ message: "You do not own this class." });
    }

    const submissionRows = await pool.query(
      `SELECT s.id, s.content_text, s.file_name, s.file_type, s.file_data_url, s.status
       FROM submissions s
       INNER JOIN activities a ON a.id = s.activity_id
       WHERE a.class_id = $1
       ORDER BY s.submitted_at ASC`,
      [classId],
    );

    if (submissionRows.rows.length === 0) {
      return res
        .status(200)
        .json({
          message: "No submissions available for analysis.",
          updated: 0,
        });
    }

    let updated = 0;

    for (const submission of submissionRows.rows) {
      const analysis = await analyzeSubmissionContent(submission);

      await pool.query(
        `UPDATE submissions
         SET status = 'analyzed',
             ai_probability = $2,
             is_ai_generated = $3,
             analysis_details = $4::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          submission.id,
          analysis.aiProbability,
          analysis.isAIGenerated,
          JSON.stringify({
            ...analysis.details,
            fileName: submission.file_name ?? null,
            fileType: submission.file_type ?? null,
          }),
        ],
      );

      updated += 1;
    }

    return res.status(200).json({
      message: "Submissions analyzed successfully.",
      updated,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to analyze submissions.",
      error: error.message,
    });
  }
});

export default router;
