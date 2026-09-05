import type { PublicAnswerValue, PublicQuestion } from "@/types/public-survey";

type Answers = Record<string, Exclude<PublicAnswerValue, null>>;

export function reachableQuestions(
  questions: PublicQuestion[],
  answers: Answers,
): PublicQuestion[] {
  if (!questions.length) return [];
  const byId = new Map(
    questions.map((question, index) => [question.id, index]),
  );
  const reached: PublicQuestion[] = [];
  let index = 0;
  while (index < questions.length) {
    const question = questions[index]!;
    reached.push(question);
    if (question.type !== "SINGLE_CHOICE") {
      index += 1;
      continue;
    }
    const hasBranching = question.options.some(
      (option) => option.destination.type !== "NEXT",
    );
    const answer = answers[String(question.position)];
    if (!Number.isInteger(answer)) {
      if (hasBranching) break;
      index += 1;
      continue;
    }
    const selected = question.options.find(
      (option) => option.position === answer,
    );
    if (!selected) break;
    if (selected.destination.type === "END") break;
    if (selected.destination.type === "QUESTION") {
      const destinationIndex = selected.destination.questionId
        ? byId.get(selected.destination.questionId)
        : undefined;
      if (destinationIndex === undefined || destinationIndex <= index) break;
      index = destinationIndex;
      continue;
    }
    index += 1;
  }
  return reached;
}

export function pruneUnreachableAnswers(
  questions: PublicQuestion[],
  answers: Answers,
): Answers {
  const reachable = new Set(
    reachableQuestions(questions, answers).map((question) =>
      String(question.position),
    ),
  );
  return Object.fromEntries(
    Object.entries(answers).filter(([position]) => reachable.has(position)),
  );
}
