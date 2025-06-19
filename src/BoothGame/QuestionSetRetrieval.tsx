import React from "react";
import { ActiveLifecycleSpan, ComponentLifecycleTracing } from "../tracing/ComponentLifecycleTracing";
import { HoneycombTeamContext } from "./HoneycombTeamContext";
import { fetchFromBackend } from "../tracing/fetchFromBackend";
import { QuizQuestionsResponse } from "observaquiz-contracts/types/quiz-types";

type QuestionSetState = "loading" | "error";

// Legacy API response format (what the current backend returns)
type LegacyQuestionSetResponse = {
  question_set: string;
  questions: Array<{
    question: string;
    id: string;
    prompt_check?: string;
  }>;
};

// Legacy type for backward compatibility - will be removed once all components are migrated
export type QuestionSet = {
  question_set: string;
  questions: Array<{
    question: string;
    id: string;
  }>;
};

// Adapter function to convert legacy API response to contract format
function adaptLegacyQuestionSetToContract(legacy: LegacyQuestionSetResponse): QuizQuestionsResponse {
  return {
    session_id: legacy.question_set, // Use question_set as session_id for now
    questions: legacy.questions.map(q => ({
      id: q.id,
      type: 'text_input' as const, // Default to text_input for legacy questions
      text: q.question
    }))
  };
}

// Function to convert contract format back to legacy format for backward compatibility
function adaptContractToLegacyQuestionSet(contract: QuizQuestionsResponse): QuestionSet {
  return {
    question_set: contract.session_id,
    questions: contract.questions.map(q => ({
      question: q.text,
      id: q.id
    }))
  };
}

export function QuestionSetRetrievalInternal(props: QuestionSetRetrievalProps) {
  const honeycombTeam = React.useContext(HoneycombTeamContext);
  const { moveForward } = props;
  const span = React.useContext(ActiveLifecycleSpan);

  const [questionSetState, setQuestionSetState] = React.useState<QuestionSetState>("loading");

  React.useEffect(() => {
    fetchFromBackend({ url: "/api/questions", honeycombTeam, span, method: "GET" })
      .then((json) => {
        // Convert legacy API response to contract format
        const legacyResponse = json as LegacyQuestionSetResponse;
        const contractResponse = adaptLegacyQuestionSetToContract(legacyResponse);

        // Convert back to legacy format for backward compatibility with existing components
        const legacyFormat = adaptContractToLegacyQuestionSet(contractResponse);

        span.addLog("questions retrieved and adapted", {
          "app.questions.count": contractResponse.questions.length,
          "app.questions.session_id": contractResponse.session_id,
          "app.questions.contract_format": "QuizQuestionsResponse"
        });

        moveForward(legacyFormat);
      })
      .catch((e) => {
        setQuestionSetState("error");
        span.addError("error fetching questions", e);
        console.log("I don't know what to do here!");
      });
  }, [honeycombTeam, moveForward, span]);

  // Note: We now use contract types internally and adapt to/from legacy format for compatibility

  var content = null;
  if (questionSetState === "loading") {
    content = (
      <div className="loading">
        <progress>progress</progress>
      </div>
    );
  } else {
    span.addLog("Unhandled state", {
      "error.message": "trying to ask questions but there was an error loading them",
    });
    content = <div className="error">DOOOM</div>;
  }

  return content;
}

type QuestionSetRetrievalProps = { moveForward: (questionSet: QuestionSet) => void };

export function QuestionSetRetrieval(props: QuestionSetRetrievalProps) {
  return (
    <ComponentLifecycleTracing componentName="QuestionSetRetrieval">
      <QuestionSetRetrievalInternal {...props} />
    </ComponentLifecycleTracing>
  );
}
