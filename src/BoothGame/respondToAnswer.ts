import { ActiveLifecycleSpanType } from "../tracing/activeLifecycleSpan";
import { HoneycombTeamContextType } from "./HoneycombTeamContext";
import { fetchFromBackend } from "../tracing/fetchFromBackend";
import { AnswerResponse } from "observaquiz-contracts/types/quiz-types";

export type ResponseFromAI =
  | {
    status: "success";
    response: AnswerResponse;
  }
  | { status: "failure"; error: string };

// Legacy API response format (what the current backend returns)
type LegacyAnswerAPIResponse = {
  score: number;
  possible_score: number;
  response: string;
  evaluation_id: string;
};

// Adapter function to convert legacy answer response to contract format
function adaptLegacyAnswerToContract(legacy: LegacyAnswerAPIResponse, sessionId: string): AnswerResponse {
  // Determine if answer is correct based on score (this is a heuristic)
  const maxScore = legacy.possible_score || 100;
  const correct = legacy.score >= (maxScore * 0.7); // Consider 70%+ as correct

  return {
    correct,
    explanation: legacy.response,
    session_id: sessionId,
    score: legacy.score,
    quiz_complete: false // We don't have this info in legacy format
  };
}

function verifyLegacyResponse(
  response: any
): { status: "rejected"; reasons: string[] } | { status: "success"; response: LegacyAnswerAPIResponse } {
  const rejections = [];
  if (!response) {
    rejections.push("Response is empty");
  } else {
    if (response.score === undefined) {
      rejections.push("Response is missing score");
    }
    if (typeof response.score != "number") {
      rejections.push("Response score is not a number");
    }
    if (typeof response.response != "string") {
      rejections.push("Response response is not a string");
    }
    if (response.response === undefined) {
      rejections.push("Response is missing response");
    }
  }
  if (rejections.length > 0) {
    return { status: "rejected", reasons: rejections };
  } else {
    return { status: "success", response: response as LegacyAnswerAPIResponse };
  }
}

export function fetchResponseToAnswer(
  span: ActiveLifecycleSpanType,
  honeycombTeam: HoneycombTeamContextType,
  params: {
    questionId: string;
    questionText: string;
    answerContent: string;
  }
): Promise<ResponseFromAI> {
  const { questionId, answerContent } = params;
  const url = `/api/questions/${questionId}/answer`;
  const body = JSON.stringify({
    answer: answerContent,
  });
  return fetchFromBackend({
    span,
    honeycombTeam,
    method: "POST",
    url,
    body,
    attributesFromJson: (json: any) => {
      return {
        "app.question.score": json.score,
        "app.question.response": json.response,
      };
    },
  })
    .then<ResponseFromAI>((json) => {
      const result = verifyLegacyResponse(json);
      if (result.status === "rejected") {
        return { status: "failure", error: result.reasons.join(", ") };
      }

      // Convert legacy response to contract format
      const sessionId = "default-session"; // TODO: Get actual session ID from context
      const contractResponse = adaptLegacyAnswerToContract(result.response, sessionId);

      span.addLog("answer response adapted to contract", {
        "app.answer.contract_format": "AnswerResponse",
        "app.answer.correct": contractResponse.correct,
        "app.answer.score": contractResponse.score
      });

      return { status: "success", response: contractResponse };
    })
    .catch<ResponseFromAI>((error: Error) => {
      return { status: "failure", error: error.message };
    });
}
