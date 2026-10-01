import { useDraft } from '../../hooks/useDraft';
import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import feedIcon from '../../assets/icons/feed.png';
import searchIcon from '../../assets/icons/search.png';
import profileIcon from '../../assets/icons/profile.png';
import commentsIcon from '../../assets/icons/comments.png';
import wardrobeIcon from '../../assets/icons/wardrobe.png';
import { useAuth } from '../../hooks/useAuth';
import { createApiFeedRepository } from '../../core/infrastructure/repositories/apiFeedRepository';
import { createApiUserRepository } from '../../core/infrastructure/repositories/apiUserRepository';
import './PublicProfilePage.css';

const userRepository = createApiUserRepository();
const feedRepository = createApiFeedRepository();

const stripMusicLine = (value) => {
  const text = String(value || '');
  if (!text) {
    return '';
  }
  return text
    .split('\n')
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return !(normalized.startsWith('музыка:') || normalized.startsWith('источник:'));
    })
    .join('\n')
    .trim();
};

const formatDateTime = (value) => {
  if (!value) {
    return '';
  }
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return '';
  }
};

const pluralizeRu = (value, one, few, many) => {
  const abs = Math.abs(Number(value) || 0);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }
  return many;
};

const formatRelativeTime = (value) => {
  if (!value) {
    return '';
  }
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 5) {
    return 'только что';
  }
  if (diffSeconds < 60) {
    return `${diffSeconds} ${pluralizeRu(diffSeconds, 'секунду', 'секунды', 'секунд')} назад`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} ${pluralizeRu(diffMinutes, 'минуту', 'минуты', 'минут')} назад`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ${pluralizeRu(diffHours, 'час', 'часа', 'часов')} назад`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} ${pluralizeRu(diffDays, 'день', 'дня', 'дней')} назад`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) {
    return `${diffWeeks} ${pluralizeRu(diffWeeks, 'неделю', 'недели', 'недель')} назад`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} ${pluralizeRu(diffMonths, 'месяц', 'месяца', 'месяцев')} назад`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} ${pluralizeRu(diffYears, 'год', 'года', 'лет')} назад`;
};

const PublicProfilePage = ({
  embedded = false,
  usernameOverride = '',
  fallbackProfile = null,
  onBack = null,
  onOpenPublicProfile = null,
  onOpenTab = null,
  onCommentCreated = null
}) => {
  const { username: routeUsername } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth } = useAuth();
  const resolvedUsername = String(usernameOverride || routeUsername || '').trim();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPost, setSelectedPost] = useState(null);
  const [isFollowUpdating, setIsFollowUpdating] = useState(false);
  const [likesViewer, setLikesViewer] = useState({
    open: false,
    title: '',
    items: [],
    loading: false,
    error: ''
  });
  const [followingViewer, setFollowingViewer] = useState({
    open: false,
    title: '',
    items: [],
    total: 0,
    loading: false,
    error: ''
  });
  const [commentsViewer, setCommentsViewer] = useState({
    open: false,
    title: '',
    items: [],
    total: 0,
    loading: false,
    submitting: false,
    postId: null,
    text: '',
    error: ''
  });
  const [commentText, setCommentText] = useDraft(`comment:${user?.id}:${commentsViewer.postId}`);
  const commentSubmitRef = useRef(false);
  const [guestPrompt, setGuestPrompt] = useState({
    open: false,
    actionLabel: ''
  });

  const isOwnProfile = useMemo(() => {
    return String(user?.username || '').toLowerCase() === String(resolvedUsername || '').toLowerCase();
  }, [user?.username, resolvedUsername]);

  const mergeWithFallbackProfile = (baseProfile, rawFallback) => {
    const fallback = rawFallback && typeof rawFallback === 'object' ? rawFallback : null;
    if (!baseProfile || !fallback) {
      return baseProfile;
    }
    if (String(baseProfile.username || '').toLowerCase() !== String(fallback.username || '').toLowerCase()) {
      return baseProfile;
    }

    const basePosts = Array.isArray(baseProfile.posts) ? baseProfile.posts : [];
    const fallbackPosts = Array.isArray(fallback.posts) ? fallback.posts : [];
    if (!fallbackPosts.length) {
      return baseProfile;
    }

    const mergedById = new Map();
    basePosts.forEach((post) => {
      const postId = Number(post?.feed_item_id);
      if (Number.isInteger(postId)) {
        mergedById.set(postId, post);
      }
    });
    fallbackPosts.forEach((post) => {
      const postId = Number(post?.feed_item_id);
      if (!Number.isInteger(postId) || mergedById.has(postId)) {
        return;
      }
      mergedById.set(postId, {
        feed_item_id: postId,
        caption: String(post?.caption || ''),
        image_url: String(post?.image_url || ''),
        likes_count: Number(post?.likes_count || 0),
        comments_count: Number(post?.comments_count || 0),
        created_at: post?.created_at || null,
        source_post_id: post?.source_post_id ?? null,
        source_type: post?.source_type ?? null,
        hashtags: Array.isArray(post?.hashtags)
          ? post.hashtags.map((tag) => String(tag || '').replace(/^#/, '').trim()).filter(Boolean)
          : []
      });
    });

    const mergedPosts = Array.from(mergedById.values()).sort((a, b) => {
      const timeA = new Date(a?.created_at || 0).getTime();
      const timeB = new Date(b?.created_at || 0).getTime();
      const safeA = Number.isFinite(timeA) ? timeA : 0;
      const safeB = Number.isFinite(timeB) ? timeB : 0;
      if (safeA !== safeB) {
        return safeB - safeA;
      }
      return Number(b?.feed_item_id || 0) - Number(a?.feed_item_id || 0);
    });

    const mergedLikesTotal = mergedPosts.reduce((acc, post) => acc + Number(post?.likes_count || 0), 0);
    return {
      ...baseProfile,
      posts: mergedPosts,
      posts_count: Math.max(Number(baseProfile.posts_count || 0), mergedPosts.length),
      likes_count: Math.max(Number(baseProfile.likes_count || 0), mergedLikesTotal),
    };
  };

  const loadProfile = async () => {
    setIsLoading(true);
    setError('');
    const navigationFallback = location.state?.fallbackProfile;
    const allowedFallback = fallbackProfile || navigationFallback;
    try {
      const payload = await userRepository.fetchPublicProfile(resolvedUsername, { limit: 90 });
      setProfile(mergeWithFallbackProfile(payload, allowedFallback));
    } catch (loadError) {
      if (
        allowedFallback
        && String(allowedFallback.username || '').toLowerCase() === String(resolvedUsername || '').toLowerCase()
      ) {
        setProfile(allowedFallback);
      } else {
        setError(loadError?.message || 'Не удалось загрузить профиль');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!resolvedUsername) return;
    void loadProfile();
  }, [resolvedUsername, fallbackProfile]);

  const handleFollowToggle = async () => {
    if (user?.isGuest) {
      setGuestPrompt({ open: true, actionLabel: 'подписываться на пользователей' });
      return;
    }
    if (!profile || isOwnProfile || isFollowUpdating) {
      return;
    }

    const currentlyFollowing = Boolean(profile.is_following);
    setIsFollowUpdating(true);
    setError('');
    try {
      if (currentlyFollowing) {
        await userRepository.unfollowUser(resolvedUsername);
      } else {
        await userRepository.followUser(resolvedUsername);
      }
      await loadProfile();
    } catch (followError) {
      setError(followError?.message || 'Не удалось обновить подписку');
    } finally {
      setIsFollowUpdating(false);
    }
  };

  const openChat = () => {
    if (user?.isGuest) {
      setGuestPrompt({ open: true, actionLabel: 'писать сообщения' });
      return;
    }
    if (typeof onOpenTab === 'function') {
      onOpenTab('chat');
      return;
    }
    navigate('/', { state: { openTab: 'chat' } });
  };

  const openProfileByUsername = (targetUsername) => {
    const normalized = String(targetUsername || '').trim();
    if (!normalized) {
      return;
    }

    if (typeof onOpenPublicProfile === 'function') {
      onOpenPublicProfile(normalized);
      return;
    }

    navigate(`/u/${encodeURIComponent(normalized)}`);
  };

  const incrementCommentsCount = (feedItemId) => {
    const normalizedId = Number(feedItemId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      return;
    }

    setProfile((prev) => {
      if (!prev || !Array.isArray(prev.posts)) {
        return prev;
      }
      return {
        ...prev,
        posts: prev.posts.map((post) => (
          Number(post.feed_item_id) === normalizedId
            ? { ...post, comments_count: Number(post.comments_count || 0) + 1 }
            : post
        ))
      };
    });
    setSelectedPost((prev) => {
      if (!prev || Number(prev.feed_item_id) !== normalizedId) {
        return prev;
      }
      return { ...prev, comments_count: Number(prev.comments_count || 0) + 1 };
    });
  };

  const openCommentsViewer = async (post) => {
    const feedItemId = Number(post?.feed_item_id);
    if (!Number.isInteger(feedItemId) || feedItemId <= 0) {
      return;
    }
    setCommentsViewer({
      open: true,
      title: `Комментарии поста #${feedItemId}`,
      items: [],
      total: 0,
      loading: true,
      submitting: false,
      postId: feedItemId,
      text: '',
      error: ''
    });
    try {
      const payload = await feedRepository.fetchFeedItemComments(feedItemId, { limit: 200 });
      setCommentsViewer({
        open: true,
        title: `Комментарии поста #${feedItemId}`,
        items: Array.isArray(payload?.items) ? payload.items : [],
        total: Number(payload?.total || 0),
        loading: false,
        submitting: false,
        postId: feedItemId,
        text: '',
        error: ''
      });
    } catch (commentsError) {
      setCommentsViewer({
        open: true,
        title: `Комментарии поста #${feedItemId}`,
        items: [],
        total: 0,
        loading: false,
        submitting: false,
        postId: feedItemId,
        text: '',
        error: commentsError?.message || 'Не удалось загрузить комментарии'
      });
    }
  };

  const handleSubmitComment = async () => {
    if (commentSubmitRef.current) return;
    if (user?.isGuest) {
      setGuestPrompt({ open: true, actionLabel: 'оставлять комментарии' });
      return;
    }
    const feedItemId = Number(commentsViewer.postId);
    const text = String(commentText || '').trim();
    if (!Number.isInteger(feedItemId) || feedItemId <= 0) {
      return;
    }
    if (!text) {
      setCommentsViewer((prev) => ({ ...prev, error: 'Введите комментарий' }));
      return;
    }

    commentSubmitRef.current = true;
    setCommentsViewer((prev) => ({ ...prev, submitting: true, error: '' }));
    try {
      const created = await feedRepository.addFeedItemComment(feedItemId, { text });
      setCommentText('');
      setCommentsViewer((prev) => ({
        ...prev,
        items: [...(Array.isArray(prev.items) ? prev.items : []), created],
        total: Number(prev.total || 0) + 1,
        text: '',
        submitting: false
      }));
      incrementCommentsCount(feedItemId);
      if (typeof onCommentCreated === 'function') {
        onCommentCreated(feedItemId, 1);
      }
    } catch (submitError) {
      setCommentsViewer((prev) => ({
        ...prev,
        submitting: false,
        error: submitError?.message || 'Не удалось отправить комментарий'
      }));
    } finally {
      commentSubmitRef.current = false;
    }
  };

  const openLikesViewer = async (post) => {
    const feedItemId = Number(post?.feed_item_id);
    if (!Number.isInteger(feedItemId) || feedItemId <= 0) {
      return;
    }
    setLikesViewer({
      open: true,
      title: `Лайки поста #${feedItemId}`,
      items: [],
      loading: true,
      error: ''
    });
    try {
      const payload = await feedRepository.fetchFeedItemLikes(feedItemId, { limit: 200 });
      setLikesViewer({
        open: true,
        title: `Лайки поста #${feedItemId}`,
        items: Array.isArray(payload?.items) ? payload.items : [],
        loading: false,
        error: ''
      });
    } catch (likesError) {
      setLikesViewer({
        open: true,
        title: `Лайки поста #${feedItemId}`,
        items: [],
        loading: false,
        error: likesError?.message || 'Не удалось загрузить список лайков'
      });
    }
  };

  const openFollowingViewer = async () => {
    if (!profile) {
      return;
    }

    setFollowingViewer({
      open: true,
      title: `Подписки @${profile.username}`,
      items: [],
      total: 0,
      loading: true,
      error: ''
    });
    try {
      const payload = await userRepository.fetchUserFollowing(profile.username, { limit: 300 });
      setFollowingViewer({
        open: true,
        title: `Подписки @${profile.username}`,
        items: Array.isArray(payload?.items) ? payload.items : [],
        total: Number(payload?.total || 0),
        loading: false,
        error: ''
      });
    } catch (viewerError) {
      setFollowingViewer({
        open: true,
        title: `Подписки @${profile.username}`,
        items: [],
        total: 0,
        loading: false,
        error: viewerError?.message || 'Не удалось загрузить подписки'
      });
    }
  };

  const exitGuestAndNavigate = (path) => {
    clearAuth();
    navigate(path);
  };

  const openTab = (tab) => {
    if (user?.isGuest && tab === 'chat') {
      setGuestPrompt({ open: true, actionLabel: 'писать сообщения' });
      return;
    }
    if (typeof onOpenTab === 'function') {
      onOpenTab(tab);
      return;
    }
    navigate('/', { state: { openTab: tab } });
  };

  return (
    <div className={`public-profile ${embedded ? 'public-profile--embedded' : ''}`}>
      <header className="public-profile__header">
        <button
          className="public-profile__back"
          onClick={() => {
            if (typeof onBack === 'function') {
              onBack();
              return;
            }
            navigate(-1);
          }}
        >
          ← Назад
        </button>
        <h1>@{resolvedUsername}</h1>
        <button className="public-profile__menu">⋯</button>
      </header>

      <div className="public-profile__content">
        {isLoading && <div className="public-profile__empty">Загружаем профиль...</div>}
        {!isLoading && error && <div className="tryon-alert tryon-alert--error">{error}</div>}

        {!isLoading && !error && profile ? (
          <>
            <section className="public-profile__top">
              <img
                className="public-profile__avatar"
                src={
                  profile.avatar_url
                    || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username)}&background=ff0000&color=fff`
                }
                alt={profile.username}
              />
              <div className="public-profile__stats-row">
                <div><strong>{profile.followers_count || 0}</strong><span>подписчики</span></div>
                <button type="button" className="public-profile__stats-btn" onClick={() => { void openFollowingViewer(); }}>
                  <strong>{profile.following_count || 0}</strong>
                  <span>подписки</span>
                </button>
              </div>
            </section>

            <section className="public-profile__bio">
              <h2>{profile.username}</h2>
              <p>{String(profile.status || '').trim() || 'Публикую свои образы после примерок в SwipeIt'}</p>
            </section>

            {!isOwnProfile && (
              <section className="public-profile__actions">
                <button className="public-profile__btn public-profile__btn--primary" onClick={handleFollowToggle} disabled={isFollowUpdating}>
                  {profile.is_following ? 'Вы подписаны' : 'Подписаться'}
                </button>
                <button className="public-profile__btn" onClick={openChat}>
                  Сообщение
                </button>
              </section>
            )}

            <section className="public-profile__section">
              <div className="public-profile__section-title">Публикации</div>
              {Array.isArray(profile.posts) && profile.posts.length > 0 ? (
                <div className="public-profile__feed">
                  {profile.posts.map((post) => (
                    <article
                      key={post.feed_item_id}
                      className="public-profile__feed-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedPost(post)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedPost(post);
                        }
                      }}
                    >
                      <img
                        src={post.image_url || 'https://via.placeholder.com/700x1000?text=No+Image'}
                        alt={post.caption || 'Пост'}
                      />
                      <div className="public-profile__feed-card-body">
                        <p>{stripMusicLine(post.caption) || `Пост #${post.feed_item_id}`}</p>
                        <div className="public-profile__feed-card-meta">
                          <button
                            type="button"
                            className="public-profile__likes-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              void openLikesViewer(post);
                            }}
                          >
                            {post.likes_count || 0} лайков
                          </button>
                          <button
                            type="button"
                            className="public-profile__likes-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              void openCommentsViewer(post);
                            }}
                          >
                            {post.comments_count || 0} комментариев
                          </button>
                          <span>{formatDateTime(post.created_at) || 'Без даты'}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="public-profile__empty">Пока нет опубликованных образов</div>
              )}
            </section>
          </>
        ) : null}
      </div>

      {selectedPost && (
        <div className="profile-modal-backdrop" onClick={() => setSelectedPost(null)}>
          <div className="profile-modal profile-modal--wide" onClick={(event) => event.stopPropagation()}>
            <h3>Пост #{selectedPost.feed_item_id}</h3>
            <img className="public-profile__modal-image" src={selectedPost.image_url || ''} alt={selectedPost.caption || 'Пост'} />
            <p className="public-profile__caption">{stripMusicLine(selectedPost.caption) || 'Без подписи'}</p>
            {Array.isArray(selectedPost.hashtags) && selectedPost.hashtags.length > 0 && (
              <p className="public-profile__meta">
                {selectedPost.hashtags.map((tag) => `#${String(tag).replace(/^#/, '')}`).join(' ')}
              </p>
            )}
            {selectedPost.source_post_id && (
              <p className="public-profile__meta">Источник: пост #{selectedPost.source_post_id}</p>
            )}
            <p className="public-profile__meta">Опубликовано: {formatDateTime(selectedPost.created_at) || 'Без даты'}</p>
            <div className="profile-modal-actions">
              <button
                type="button"
                className="profile-modal-cancel"
                onClick={() => {
                  void openCommentsViewer(selectedPost);
                }}
              >
                Комментарии ({selectedPost.comments_count || 0})
              </button>
              <button type="button" className="edit-profile-btn" onClick={() => setSelectedPost(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {likesViewer.open && (
        <div className="profile-modal-backdrop" onClick={() => setLikesViewer((prev) => ({ ...prev, open: false }))}>
          <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{likesViewer.title}</h3>
            {likesViewer.loading && <div className="public-profile__empty">Загружаем список...</div>}
            {!likesViewer.loading && likesViewer.error && <div className="tryon-alert tryon-alert--error">{likesViewer.error}</div>}
            {!likesViewer.loading && !likesViewer.error && likesViewer.items.length === 0 && (
              <div className="public-profile__empty">Пока никто не лайкнул этот пост</div>
            )}
            {!likesViewer.loading && !likesViewer.error && likesViewer.items.length > 0 && (
              <div className="likes-list">
                {likesViewer.items.map((likeUser) => (
                  <button
                    key={`${likeUser.user_id}-${likeUser.liked_at}`}
                    type="button"
                    className="likes-user-item"
                    onClick={() => openProfileByUsername(likeUser.username)}
                  >
                    <img
                      src={likeUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(likeUser.username)}&background=ff0000&color=fff`}
                      alt={likeUser.username}
                    />
                    <div className="likes-user-meta">
                      <strong>@{likeUser.username}</strong>
                      <span>{formatDateTime(likeUser.liked_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="profile-modal-actions">
              <button type="button" className="edit-profile-btn" onClick={() => setLikesViewer((prev) => ({ ...prev, open: false }))}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {commentsViewer.open && (
        <div className="profile-modal-backdrop" onClick={() => setCommentsViewer((prev) => ({ ...prev, open: false, text: '', error: '' }))}>
          <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{commentsViewer.title}</h3>
            {commentsViewer.loading && <div className="public-profile__empty">Загружаем комментарии...</div>}
            {!commentsViewer.loading && commentsViewer.error && (
              <div className="tryon-alert tryon-alert--error">{commentsViewer.error}</div>
            )}
            {!commentsViewer.loading && !commentsViewer.error && commentsViewer.items.length === 0 && (
              <div className="public-profile__empty">Пока нет комментариев</div>
            )}
            {!commentsViewer.loading && !commentsViewer.error && commentsViewer.items.length > 0 && (
              <div className="likes-list">
                {commentsViewer.items.map((commentItem) => (
                  <div key={commentItem.id} className="likes-user-item">
                    <img
                      src={commentItem.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(commentItem.username)}&background=ff0000&color=fff`}
                      alt={commentItem.username}
                    />
                    <div className="likes-user-meta">
                      <strong>@{commentItem.username}</strong>
                      <span>{formatRelativeTime(commentItem.created_at)}</span>
                      <p className="profile-comment-text">{commentItem.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="public-profile__comment-form">
              <textarea
                maxLength={1000}
                  disabled={commentsViewer.submitting}
                  value={commentText}
                placeholder="Оставьте комментарий..."
                onChange={(event) => setCommentText(event.target.value)}
              />
              <button type="button" className="edit-profile-btn" onClick={() => { void handleSubmitComment(); }} disabled={commentsViewer.submitting}>
                {commentsViewer.submitting ? '...' : 'Отправить'}
              </button>
            </div>
            <div className="profile-modal-actions">
              <button
                type="button"
                className="edit-profile-btn"
                onClick={() => setCommentsViewer((prev) => ({ ...prev, open: false, text: '', error: '' }))}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {followingViewer.open && (
        <div className="profile-modal-backdrop" onClick={() => setFollowingViewer((prev) => ({ ...prev, open: false }))}>
          <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{followingViewer.title}</h3>
            <p className="public-profile__meta">{followingViewer.total} профилей</p>
            {followingViewer.loading && <div className="public-profile__empty">Загружаем список...</div>}
            {!followingViewer.loading && followingViewer.error && (
              <div className="tryon-alert tryon-alert--error">{followingViewer.error}</div>
            )}
            {!followingViewer.loading && !followingViewer.error && followingViewer.items.length === 0 && (
              <div className="public-profile__empty">Подписок пока нет</div>
            )}
            {!followingViewer.loading && !followingViewer.error && followingViewer.items.length > 0 && (
              <div className="likes-list">
                {followingViewer.items.map((item) => (
                  <button
                    key={item.user_id}
                    type="button"
                    className="likes-user-item"
                    onClick={() => {
                      setFollowingViewer((prev) => ({ ...prev, open: false }));
                      openProfileByUsername(item.username);
                    }}
                  >
                    <img
                      src={item.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.username)}&background=ff0000&color=fff`}
                      alt={item.username}
                    />
                    <div className="likes-user-meta">
                      <strong>@{item.username}</strong>
                      <span>{item.is_following ? 'Вы подписаны' : 'Не подписаны'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="profile-modal-actions">
              <button
                type="button"
                className="edit-profile-btn"
                onClick={() => setFollowingViewer((prev) => ({ ...prev, open: false }))}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {guestPrompt.open && (
        <div className="profile-modal-backdrop" onClick={() => setGuestPrompt((prev) => ({ ...prev, open: false }))}>
          <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Требуется аккаунт</h3>
            <p className="public-profile__meta">
              Чтобы {guestPrompt.actionLabel || 'выполнить это действие'}, войдите или зарегистрируйтесь.
            </p>
            <div className="profile-modal-actions">
              <button type="button" className="profile-modal-cancel" onClick={() => exitGuestAndNavigate('/login')}>
                Войти
              </button>
              <button type="button" className="edit-profile-btn" onClick={() => exitGuestAndNavigate('/register')}>
                Регистрация
              </button>
            </div>
          </div>
        </div>
      )}

      {!embedded && (
        <nav className="public-profile__bottom-nav">
          <button className="public-profile__nav-btn" onClick={() => openTab('feed')}>
            <img src={feedIcon} alt="" />
            <span>Лента</span>
          </button>
          <button className="public-profile__nav-btn" onClick={() => openTab('search')}>
            <img src={searchIcon} alt="" />
            <span>Поиск</span>
          </button>
          <button
            className="public-profile__nav-btn"
            onClick={() => {
              if (user?.isGuest) {
                setGuestPrompt({ open: true, actionLabel: 'запускать примерку' });
                return;
              }
              navigate('/try-on');
            }}
          >
            <img src={wardrobeIcon} alt="" />
            <span>Примерка</span>
          </button>
          <button className="public-profile__nav-btn" onClick={() => openTab('chat')}>
            <img src={commentsIcon} alt="" />
            <span>Чаты</span>
          </button>
          <button className="public-profile__nav-btn is-active" onClick={() => navigate('/profile')}>
            <img src={profileIcon} alt="" />
            <span>Профиль</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default PublicProfilePage;
