import * as fs from 'fs';
import * as path from 'path';

// Test import of contract types
import { Question, AnswerResponse, QuizSession } from 'observaquiz-contracts/types/quiz-types';

describe('Package Dependencies', () => {
  let packageJson: any;

  beforeAll(() => {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    packageJson = JSON.parse(packageJsonContent);
  });

  describe('observaquiz-contracts dependency', () => {
    it('should have observaquiz-contracts as a dependency', () => {
      expect(packageJson.dependencies).toBeDefined();
      expect(packageJson.dependencies['observaquiz-contracts']).toBeDefined();
    });

    it('should reference the correct GitHub repository for observaquiz-contracts', () => {
      const contractsDependency = packageJson.dependencies['observaquiz-contracts'];
      expect(contractsDependency).toMatch(/github:KentBeck\/observaquiz-contracts/);
    });

    it('should be able to import and use contract types', () => {
      // This test verifies that the contract types can be imported and used successfully
      // Since TypeScript interfaces are compile-time only, we test by creating objects that conform to the types

      const mockQuestion: Question = {
        id: 'test-id',
        type: 'text_input',
        text: 'Test question'
      };
      expect(mockQuestion.id).toBe('test-id');
      expect(mockQuestion.type).toBe('text_input');
      expect(mockQuestion.text).toBe('Test question');

      const mockAnswerResponse: AnswerResponse = {
        correct: true,
        session_id: 'test-session',
        explanation: 'Test explanation'
      };
      expect(mockAnswerResponse.correct).toBe(true);
      expect(mockAnswerResponse.session_id).toBe('test-session');

      const mockQuizSession: QuizSession = {
        id: 'test-session',
        questions: [mockQuestion],
        current_index: 0,
        score: 0,
        answers: [],
        completed: false,
        started_at: '2023-01-01T00:00:00Z'
      };
      expect(mockQuizSession.id).toBe('test-session');
      expect(mockQuizSession.questions).toHaveLength(1);
    });
  });
});
