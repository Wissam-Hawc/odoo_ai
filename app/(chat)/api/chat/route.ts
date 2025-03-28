import {
  UIMessage,
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  getTrailingMessageId,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';

export const maxDuration = 60;

export async function POST(request: Request) {
  console.log('Received POST request to /api/chat'); // Log when the request is received

  try {
    const {
      id,
      messages,
      selectedChatModel,
    }: {
      id: string;
      messages: Array<UIMessage>;
      selectedChatModel: string;
    } = await request.json();

    console.log('Request body:', { id, selectedChatModel, messageCount: messages.length }); // Log the request body
    console.log('Selected chat model:', selectedChatModel);

    const session = await auth();
    console.log('Session:', session ? 'Authenticated' : 'Not authenticated'); // Log authentication status

    if (!session || !session.user || !session.user.id) {
      console.log('Unauthorized: No session or user ID');
      return new Response('Unauthorized', { status: 401 });
    }

    const userMessage = getMostRecentUserMessage(messages);
    console.log('User message:', userMessage); // Log the user message

    if (!userMessage) {
      console.log('No user message found');
      return new Response('No user message found', { status: 400 });
    }

    const chat = await getChatById({ id });
    console.log('Chat from DB:', chat ? 'Found' : 'Not found'); // Log chat retrieval

    if (!chat) {
      console.log('Creating new chat');
      const title = await generateTitleFromUserMessage({
        message: userMessage,
      });
      console.log('Generated title:', title);

      await saveChat({ id, userId: session.user.id, title });
      console.log('New chat saved');
    } else {
      if (chat.userId !== session.user.id) {
        console.log('Unauthorized: Chat does not belong to user');
        return new Response('Unauthorized', { status: 401 });
      }
    }

    console.log('Saving user message to DB');
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: userMessage.id,
          role: 'user',
          parts: userMessage.parts,
          attachments: userMessage.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });
    console.log('User message saved');

    console.log('Starting data stream response');
    return createDataStreamResponse({
      execute: (dataStream) => {
        console.log('Executing data stream'); // Log when streaming starts

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel }),
          messages,
          maxSteps: 5,
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          onFinish: async ({ response }) => {
            console.log('Stream finished'); // Log when streaming finishes
            if (session.user?.id) {
              try {
                const assistantId = getTrailingMessageId({
                  messages: response.messages.filter(
                    (message) => message.role === 'assistant',
                  ),
                });

                if (!assistantId) {
                  console.log('No assistant message found');
                  throw new Error('No assistant message found!');
                }

                const [, assistantMessage] = appendResponseMessages({
                  messages: [userMessage],
                  responseMessages: response.messages,
                });

                console.log('Saving assistant message to DB');
                await saveMessages({
                  messages: [
                    {
                      id: assistantId,
                      chatId: id,
                      role: assistantMessage.role,
                      parts: assistantMessage.parts,
                      attachments:
                        assistantMessage.experimental_attachments ?? [],
                      createdAt: new Date(),
                    },
                  ],
                });
                console.log('Assistant message saved');
              } catch (error) {
                console.error('Failed to save chat:', error);
              }
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        console.log('Consuming stream');
        result.consumeStream();

        console.log('Merging stream into data stream');
        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
        console.log('Stream merged');
      },
      onError: (error) => {
        console.error('Stream error:', error); // Log streaming errors
        return 'Oops, an error occurred!';
      },
    });
  } catch (error) {
    console.error('POST error:', error); // Log any errors in the POST handler
    return new Response('An error occurred while processing your request: ' + error, {
      status: 500, // Change to 500 to indicate a server error
    });
  }
}

export async function DELETE(request: Request) {
  console.log('Received DELETE request to /api/chat'); // Log DELETE requests
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    console.log('No chat ID provided');
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();
  console.log('Session for DELETE:', session ? 'Authenticated' : 'Not authenticated');

  if (!session || !session.user) {
    console.log('Unauthorized: No session or user');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });
    console.log('Chat for DELETE:', chat ? 'Found' : 'Not found');

    if (chat.userId !== session.user.id) {
      console.log('Unauthorized: Chat does not belong to user');
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });
    console.log('Chat deleted successfully');

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}