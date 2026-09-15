/** Question types supported in MVP. Extend for multi-select / short-text later. */
export type QuestionType = 'single_choice' | 'true_false';

/** Shape exposed to the admin editor — includes is_correct. */
export type AdminQuizOption = {
  id: string;
  text: string;
  isCorrect: boolean;
  sortOrder: number;
};

export type AdminQuizQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  explanation: string | null;
  sortOrder: number;
  options: AdminQuizOption[];
};

export type AdminQuiz = {
  id: string;
  lessonId: string;
  intro: string | null;
  passThresholdPercent: number;
  maxAttempts: number | null;
  showCorrectAnswers: boolean;
  questions: AdminQuizQuestion[];
};

/** Shape exposed to the student runner — no is_correct leaks. */
export type StudentQuizOption = {
  id: string;
  text: string;
  sortOrder: number;
};

export type StudentQuizQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  sortOrder: number;
  options: StudentQuizOption[];
};

export type StudentQuiz = {
  id: string;
  lessonId: string;
  intro: string | null;
  passThresholdPercent: number;
  maxAttempts: number | null;
  showCorrectAnswers: boolean;
  questions: StudentQuizQuestion[];
};

/** Shape returned after a student submits — includes grading feedback. */
export type QuizResultQuestion = {
  id: string;
  prompt: string;
  type: QuestionType;
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
  explanation: string | null;
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
};

export type QuizResult = {
  scorePercent: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  attemptsUsed: number;
  maxAttempts: number | null;
  /** Only populated when showCorrectAnswers on the quiz is true. */
  perQuestion: QuizResultQuestion[] | null;
};
