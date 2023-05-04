import {TelegramFramework} from "../src/bot/framework";
import * as Interfaces from "puregram/lib/generated/telegram-interfaces";


describe('tgActionWithRetry', () => {
  let framework: TelegramFramework;

  async function tgActionWithRetry<T>(tgAction: () => Promise<Interfaces.TelegramMessage | T>, onError?: (e: any) => any) {
    return await (framework as any).tgActionWithRetry(tgAction, onError)
  }

  beforeEach(() => {
    framework = new TelegramFramework(''); // Create a new instance of your class
  });

  it('should retry and succeed after an API error with code 429', async () => {
    const mockTgAction = jest
      .fn()
      .mockRejectedValueOnce({ code: 429, parameters: { retry_after: 1 } })
      .mockResolvedValueOnce('success');

    const result = await tgActionWithRetry(mockTgAction);

    expect(mockTgAction).toHaveBeenCalledTimes(2);
    expect(result).toBe('success');
  });

  it('should succeed without retry', async () => {
    const mockTgAction = jest.fn().mockResolvedValue('success');
    const result = await tgActionWithRetry(mockTgAction);

    expect(mockTgAction).toHaveBeenCalledTimes(1);
    expect(result).toBe('success');
  });

  it('should handle "message is not modified" error', async () => {
    const onError = jest.fn();
    const mockTgAction = jest.fn().mockRejectedValue({ code: 400, message: 'Bad Request: message is not modified' });

    const result = await tgActionWithRetry(mockTgAction, onError);

    expect(mockTgAction).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('should handle other API errors', async () => {
    const onError = jest.fn();
    const mockTgAction = jest.fn().mockRejectedValue({ code: 500, message: 'Internal Server Error' });

    const result = await tgActionWithRetry(mockTgAction, onError);

    expect(mockTgAction).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('should handle unknown errors', async () => {
    const onError = jest.fn();
    const unknownError = new Error('Unknown error');
    const mockTgAction = jest.fn().mockRejectedValue(unknownError);

    const result = await tgActionWithRetry(mockTgAction, onError);

    expect(mockTgAction).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('should stop retrying after 3 attempts with 429 errors', async () => {
    const mockTgAction = jest
      .fn()
      .mockRejectedValue({ code: 429, parameters: { retry_after: 0.1 } })
      .mockRejectedValue({ code: 429, parameters: { retry_after: 0.1 } })
      .mockRejectedValue({ code: 429, parameters: { retry_after: 0.1 } });

    const result = await tgActionWithRetry(mockTgAction);

    expect(mockTgAction).toHaveBeenCalledTimes(3);
    expect(result).toBeNull();
  }, 10000);

});
