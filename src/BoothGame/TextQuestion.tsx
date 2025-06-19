import React, { ChangeEvent, useEffect } from "react";
import { ActiveLifecycleSpan, ComponentLifecycleTracing } from "../tracing/ComponentLifecycleTracing";
import { fetchResponseToAnswer } from "./respondToAnswer";
import { HoneycombTeamContext, HoneycombTeamContextType } from "./HoneycombTeamContext";
import { useLocalTracedState } from "../tracing/LocalTracedState";
import smileyguy from "../../static/images/smileyguy.png";
import mehguy from "../../static/images/mehguy.png";
import sadguy from "../../static/images/sadguy.png";
import { fetchFromBackend } from "../tracing/fetchFromBackend";
import { ActiveLifecycleSpanType } from "../tracing/activeLifecycleSpan";

// Show the question
const NoAnswerYet = {
  name: "no answer yet",
  inputEnabled: true,
  nextStep: "submit answer",
  nextStepEnabled: false,
  askForOpinion: false,
  alternativeNextStep: undefined,
  focusOn: "text area",
};

// they have typed something in the box
const Answering = {
  name: "answering",
  inputEnabled: true,
  nextStep: "submit answer",
  nextStepEnabled: true,
  askForOpinion: false,
  alternativeNextStep: undefined,
  focusOn: "nothing",
};

// they entered their response, now ask the bff
const LoadingResponse = {
  name: "loading response",
  inputEnabled: false,
  nextStep: "cancel",
  nextStepEnabled: true,
  askForOpinion: false,
  alternativeNextStep: undefined,
  focusOn: "button",
};

// we have a response, they should read it and give their opinion
const ShowingResponse = {
  name: "showing response",
  inputEnabled: false,
  nextStep: "next question",
  nextStepEnabled: false,
  askForOpinion: true,
  alternativeNextStep: "try again",
  focusOn: "default opinion",
};

// they have selected an opinion about the response.
const OpinionGiven = {
  name: "opinion given",
  inputEnabled: false,
  nextStep: "next question",
  askForOpinion: true,
  nextStepEnabled: true,
  alternativeNextStep: "try again",
  focusOn: "button",
};

const ErrorState = {
  name: "error",
  inputEnabled: true,
  nextStep: "submit answer",
  nextStepEnabled: true,
  askForOpinion: false,
  alternativeNextStep: undefined,
  focusOn: "button",
};

type OpinionOption = "meh" | "boo" | "whoa"

const opinions: Array<{ value: OpinionOption, image: "*.png", label: string, default: boolean }> = [
  { value: "boo", image: sadguy, label: "I don't like it", default: false },
  { value: "meh", image: mehguy, label: "Meh", default: true },
  { value: "whoa", image: smileyguy, label: "Great!", default: false },
]

function reportOpinion(span: ActiveLifecycleSpanType, honeycombTeam: HoneycombTeamContextType, evaluationId: string, opinion: OpinionOption) {
  /* span: ActiveLifecycleSpanType;
  honeycombTeam: ThingWithTheHeaders;
  method: string;
  url: string;
  body?: string;
  attributesFromJson?: (json: any) => Attributes; */
  const bodyContent = {
    evaluation_id: evaluationId, opinion
  }
  // fire and forget
  fetchFromBackend({
    span,
    honeycombTeam,
    url: "api/opinion",
    method: "POST",
    body: JSON.stringify(bodyContent)
  });
}

type QuestionState =
  | typeof NoAnswerYet
  | typeof Answering
  | typeof LoadingResponse
  | typeof ShowingResponse
  | typeof OpinionGiven
  | typeof ErrorState;

function TextQuestionInternal(props: QuestionProps) {
  const activeLifecycleSpan = React.useContext(ActiveLifecycleSpan);
  const honeycombTeam = React.useContext(HoneycombTeamContext);
  const { questionText, questionId } = props;

  const [answerContent, setAnswerContent] = React.useState<string>("");
  const [opinion, setOpinion] = useLocalTracedState<OpinionOption | null>(null);
  const [evaluationId, setEvaluationId] = React.useState<string>("");
  const [response, setResponse] = React.useState<string | undefined>(undefined);
  const [highScore, setHighScore] = React.useState<number>(-2);
  const [state, setState] = useLocalTracedState<QuestionState>(NoAnswerYet, {
    componentName: "question",
    addAttributes: (newState) => ({
      "app.question.button": newState.nextStep,
      "app.question.inputEnabled": newState.inputEnabled,
      "app.question.state": newState.name,
    }),
  });

  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const textArea = React.useRef<HTMLTextAreaElement>(null);
  const defaultOpinionRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the button when the component renders or updates
    if (state.focusOn == "button") {
      buttonRef.current?.focus();
    }
    if (state.focusOn == "text area") {
      textArea.current?.focus();
    }
    if (state.focusOn == "default opinion") {
      defaultOpinionRef.current?.focus();
    }
  }, [state]);

  function handleInput(event: ChangeEvent<HTMLTextAreaElement>) {
    const typedContent = event.target.value;
    if (state.name === "no answer yet" && !!typedContent.trim()) {
      setState(Answering, { reason: "typed content" });
    }
    if (state.name === "answering" && !typedContent) {
      setState(NoAnswerYet, { reason: "removed all content" });
    }
    if (typedContent.endsWith("\n")) {
      // there has to be a better way to do this. I don't want to submit if they pressed shift-enter
      setAnswerContent(typedContent.trim());
      buttonRef.current?.click();
    } else {
      setAnswerContent(typedContent);
    }
  }

  function submitAnswer(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    event.preventDefault();
    reactToSubmit();
  }

  function reactToSubmit() {
    // this can be triggered by pressing enter in the text box, or pressing the button
    setState(LoadingResponse, { reason: "submit answer", attributes: { "app.question.answer": answerContent } });
    fetchResponse();
  }

  function fetchResponse() {
    activeLifecycleSpan;
    fetchResponseToAnswer(activeLifecycleSpan, honeycombTeam, { questionId, questionText, answerContent }).then(
      (response) => {
        // TODO: also get the DeepChecks ID of the response, so we can report the opinion.
        if (response.status === "failure") {
          setResponse(response.error || "it didn't even give me an error");
          setState(ErrorState, { reason: "failed to fetch response" });
        } else {
          const score = response.response.score || 0;
          const explanation = response.response.explanation || "No explanation provided";

          setHighScore(Math.max(highScore, score));
          // success - adapted for contract format
          const interpretation = `I give that a ${score}/100. ${explanation}`;
          setResponse(interpretation);

          // Note: evaluation_id is not available in contract format, using session_id as fallback
          setEvaluationId(response.response.session_id);
          setState(ShowingResponse, { reason: "answer received" });
        }
      }
    );
  }

  function nextQuestion(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    event.preventDefault();
    reportOpinion(activeLifecycleSpan, honeycombTeam, evaluationId, opinion!); // it doesn't matter if this fails. Fire & Forget.
    activeLifecycleSpan.withLog("next question", {}, () =>
      // no need to change state, this component will be replaced
      props.moveForward({ score: highScore })
    );
  }

  function cancel(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    event.preventDefault();
    activeLifecycleSpan.addLog("cancel");
    // TODO: not implemented. The response coming back has to check whether we have hit cancel.
  }

  function tryAgain(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    event.preventDefault();
    setResponse("");
    // leave their answer there so they can modify it
    setState(NoAnswerYet, { reason: "Try again" });
  }

  var buttonNextStep =
    state.nextStep === "submit answer"
      ? submitAnswer
      : state.nextStep === "next question"
        ? nextQuestion
        : state.nextStep === "cancel"
          ? cancel
          : () => console.log("Mystery button"); // this should never happen

  var buttonText =
    state.nextStep === "submit answer"
      ? "Submit"
      : state.nextStep === "next question"
        ? "Next Question"
        : state.nextStep === "cancel"
          ? "Cancel"
          : "Mystery Button";

  var lessExcitingButton: React.ReactNode = undefined;
  switch (state.alternativeNextStep) {
    case "try again":
      lessExcitingButton = (
        <button className="button clear" id="question-tryAgain" type="submit" onClick={tryAgain}>
          Try Again
        </button>
      );
      break;
  }

  const handleOpinion = (e: ChangeEvent<HTMLInputElement>) => {
    const opinion = e.target.value as OpinionOption;
    setOpinion(opinion, {
      attributes: {
        "app.question.response": response,
        "app.question.opinion": opinion,
        "app.question.defaultOpinion": opinions.find((o) => o.default)?.value
      }
    });
    activeLifecycleSpan.setAttributes({ "app.question.opinion": opinion })
    setState(OpinionGiven);
  };

  const opinionButtons = <>
    {opinions.map((option, i) =>
      <label htmlFor={"opinion" + i} key={"opinion" + i + "Label"}>
        <input
          id={"opinion" + i}
          className="radio"
          type="radio"
          value={option.value}
          ref={option.default ? defaultOpinionRef : null}
          key={"opinion" + i}
          checked={opinion === option.value}
          onChange={handleOpinion}
        />
        <img className="opinion-icon" src={option.image} alt={option.label} />
      </label>
    )
    }
  </>

  const usefulContent =
    state.name === "loading response" ? (
      <progress>progress</progress>
    ) : state.name === "error" ? (
      <span className="error">{response}</span>
    ) : (
      response
    );

  return (
    <div className="question-parent">
      <p className="question-text">{props.questionText}</p>
      <p>
        <textarea
          disabled={!state.inputEnabled}
          name="answer"
          className="answer-goes-here"
          value={answerContent}
          onChange={handleInput}
          ref={textArea}
        />
      </p>
      <p className="answer-response">{usefulContent}</p>
      {state.askForOpinion && <p> <span id="say-what-you-think">What do you think of that response? </span>{opinionButtons}</p>}
      <p>
        <button
          id="question-go"
          type="submit"
          disabled={!state.nextStepEnabled}
          onClick={buttonNextStep}
          ref={buttonRef}
        >
          {buttonText}
        </button>
        {lessExcitingButton}
      </p>
      <p className="fine-print">
        The information you enter will be sent to: the Observaquiz backend, OpenAI for generating a response, DeepChecks
        for evaluating that response, and Honeycomb for tracing (both your team and our team). It will be retained in
        Honeycomb for 60 days. Other conference attendees might see your answers if they come to our booth to look at the leaderboard.
      </p>
    </div>
  );
}

type QuestionProps = {
  questionNumber: number;
  questionId: string;
  questionText: string;
  moveForward: (result: QuestionResult) => void;
};

export type QuestionResult = {
  score: number;
};

// this displays a question, receives an answer, and then provides a response.
export function TextQuestion(props: QuestionProps) {
  return (
    <ComponentLifecycleTracing
      componentName="question"
      spanName={"Question: " + props.questionText}
      attributesForAllChildren={{ "app.question.text": props.questionText }}
      attributes={{ "app.question.id": props.questionId, "app.question.number": props.questionNumber }}
    >
      <TextQuestionInternal {...props} />
    </ComponentLifecycleTracing>
  );
}
