import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { groq } from '@ai-sdk/groq';
import { xai } from '@ai-sdk/xai';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': wrapLanguageModel({
          model: (() => {
            console.log('GROQ_API_KEY for chat-model:', process.env.GROQ_API_KEY ? 'Set' : 'Not set');
            if (!process.env.GROQ_API_KEY) {
              throw new Error('GROQ_API_KEY is not defined in environment variables');
            }
            console.log('Using Groq model for chat-model: llama3-8b-8192');
            return groq('llama-3.3-70b-versatile');
          })(),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'chat-model-reasoning': wrapLanguageModel({
          model: (() => {
            console.log('GROQ_API_KEY for chat-model-reasoning:', process.env.GROQ_API_KEY ? 'Set' : 'Not set');
            if (!process.env.GROQ_API_KEY) {
              throw new Error('GROQ_API_KEY is not defined in environment variables');
            }
            console.log('Using Groq model for chat-model-reasoning: llama-3.3-70b-versatile');
            return groq('llama-3.3-70b-versatile');
          })(),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': wrapLanguageModel({
          model: (() => {
            console.log('GROQ_API_KEY for title-model:', process.env.GROQ_API_KEY ? 'Set' : 'Not set');
            if (!process.env.GROQ_API_KEY) {
              throw new Error('GROQ_API_KEY is not defined in environment variables');
            }
            console.log('Using Groq model for title-model: llama-3.3-70b-versatile');
            return groq('llama-3.3-70b-versatile');
          })(),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'artifact-model': xai('grok-2-1212'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });
console.log('myProvider initialized. Test environment:', isTestEnvironment);