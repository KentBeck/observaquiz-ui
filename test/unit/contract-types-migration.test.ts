import { Question, QuizQuestionsResponse, AnswerResponse } from 'observaquiz-contracts/types/quiz-types';

// Legacy API response format (what the current backend returns)
type LegacyQuestionSetResponse = {
  question_set: string;
  questions: Array<{
    question: string;
    id: string;
    prompt_check?: string;
  }>;
};

// Legacy answer API response format
type LegacyAnswerAPIResponse = {
  score: number;
  possible_score: number;
  response: string;
  evaluation_id: string;
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

describe('Contract Types Migration', () => {
  describe('Question type compatibility', () => {
    it('should be able to create a Question using contract type', () => {
      const question: Question = {
        id: 'test-question-id',
        type: 'text_input',
        text: 'What is observability?'
      };

      expect(question.id).toBe('test-question-id');
      expect(question.type).toBe('text_input');
      expect(question.text).toBe('What is observability?');
    });

    it('should support optional fields in Question type', () => {
      const multipleChoiceQuestion: Question = {
        id: 'mc-question',
        type: 'multiple_choice',
        text: 'Which is correct?',
        options: ['Option A', 'Option B', 'Option C']
      };

      expect(multipleChoiceQuestion.options).toEqual(['Option A', 'Option B', 'Option C']);
    });
  });

  describe('QuizQuestionsResponse type compatibility', () => {
    it('should be able to create a QuizQuestionsResponse using contract type', () => {
      const questions: Question[] = [
        {
          id: 'q1',
          type: 'text_input',
          text: 'Question 1'
        },
        {
          id: 'q2',
          type: 'multiple_choice',
          text: 'Question 2',
          options: ['A', 'B']
        }
      ];

      const response: QuizQuestionsResponse = {
        session_id: 'test-session',
        questions: questions,
        current_question_index: 0
      };

      expect(response.session_id).toBe('test-session');
      expect(response.questions).toHaveLength(2);
      expect(response.current_question_index).toBe(0);
    });
  });

  describe('AnswerResponse type compatibility', () => {
    it('should be able to create an AnswerResponse using contract type', () => {
      const answerResponse: AnswerResponse = {
        correct: true,
        session_id: 'test-session',
        explanation: 'Great answer!',
        score: 85,
        quiz_complete: false
      };

      expect(answerResponse.correct).toBe(true);
      expect(answerResponse.session_id).toBe('test-session');
      expect(answerResponse.explanation).toBe('Great answer!');
      expect(answerResponse.score).toBe(85);
      expect(answerResponse.quiz_complete).toBe(false);
    });

    it('should support minimal AnswerResponse', () => {
      const minimalResponse: AnswerResponse = {
        correct: false,
        session_id: 'test-session'
      };

      expect(minimalResponse.correct).toBe(false);
      expect(minimalResponse.session_id).toBe('test-session');
      expect(minimalResponse.explanation).toBeUndefined();
      expect(minimalResponse.score).toBeUndefined();
    });
  });

  describe('Legacy API adaptation', () => {
    it('should convert legacy question set response to contract format', () => {
      const legacyResponse: LegacyQuestionSetResponse = {
        question_set: "DevRel-Testing",
        questions: [
          {
            question: "What is Observability?",
            id: "c954ab47-832c-43b1-b3de-d6f9ba995223",
            prompt_check: "Some prompt check text"
          },
          {
            question: "How can great observability help you make more money?",
            id: "a995223-932c-53b1-c3df-d6f9bc954ab47"
          }
        ]
      };

      const contractResponse = adaptLegacyQuestionSetToContract(legacyResponse);

      expect(contractResponse.session_id).toBe("DevRel-Testing");
      expect(contractResponse.questions).toHaveLength(2);
      expect(contractResponse.questions[0].id).toBe("c954ab47-832c-43b1-b3de-d6f9ba995223");
      expect(contractResponse.questions[0].type).toBe("text_input");
      expect(contractResponse.questions[0].text).toBe("What is Observability?");
      expect(contractResponse.questions[1].text).toBe("How can great observability help you make more money?");
    });

    it('should convert legacy answer response to contract format', () => {
      const legacyAnswer: LegacyAnswerAPIResponse = {
        score: 85,
        possible_score: 100,
        response: "Great answer! You understand observability well.",
        evaluation_id: "eval-123"
      };

      const contractAnswer = adaptLegacyAnswerToContract(legacyAnswer, "test-session");

      expect(contractAnswer.correct).toBe(true); // 85/100 >= 70%
      expect(contractAnswer.explanation).toBe("Great answer! You understand observability well.");
      expect(contractAnswer.session_id).toBe("test-session");
      expect(contractAnswer.score).toBe(85);
      expect(contractAnswer.quiz_complete).toBe(false);
    });

    it('should mark low scores as incorrect', () => {
      const legacyAnswer: LegacyAnswerAPIResponse = {
        score: 30,
        possible_score: 100,
        response: "This answer needs improvement.",
        evaluation_id: "eval-456"
      };

      const contractAnswer = adaptLegacyAnswerToContract(legacyAnswer, "test-session");

      expect(contractAnswer.correct).toBe(false); // 30/100 < 70%
      expect(contractAnswer.explanation).toBe("This answer needs improvement.");
      expect(contractAnswer.score).toBe(30);
    });
  });

  describe('TextQuestion component compatibility', () => {
    it('should handle AnswerResponse format in TextQuestion logic', () => {
      // Simulate what TextQuestion component does with the response
      const contractResponse: AnswerResponse = {
        correct: true,
        explanation: "Great answer! You understand observability well.",
        session_id: "test-session",
        score: 85,
        quiz_complete: false
      };

      // Test the logic that TextQuestion uses
      const score = contractResponse.score || 0;
      const explanation = contractResponse.explanation || "No explanation provided";

      // Since we don't have possible_score in contract, we'll need to adapt the display logic
      const interpretation = `I give that a ${score}/100. ${explanation}`;

      expect(score).toBe(85);
      expect(explanation).toBe("Great answer! You understand observability well.");
      expect(interpretation).toBe("I give that a 85/100. Great answer! You understand observability well.");
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalResponse: AnswerResponse = {
        correct: false,
        session_id: "test-session"
      };

      const score = minimalResponse.score || 0;
      const explanation = minimalResponse.explanation || "No explanation provided";
      const interpretation = `I give that a ${score}/100. ${explanation}`;

      expect(score).toBe(0);
      expect(explanation).toBe("No explanation provided");
      expect(interpretation).toBe("I give that a 0/100. No explanation provided");
    });
  });
});
