export const publishTryOnSession = async (
  tryOnRepository,
  sessionId,
  { caption = '', sourceType = null, sourcePostId = null, hashtags = [] } = {}
) => {
  if (!Number.isInteger(Number(sessionId)) || Number(sessionId) <= 0) {
    throw new Error('Сначала завершите примерку.');
  }
  if (caption.length > 2000 || hashtags.length > 20 || hashtags.some((tag) => tag.length > 64)) {
    throw new Error('Подпись: максимум 2000 символов; хештеги: максимум 20, до 64 символов каждый.');
  }
  return tryOnRepository.publishTryOnSession(sessionId, {
    caption,
    sourceType,
    sourcePostId,
    hashtags
  });
};
