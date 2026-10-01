import HintedInput from '../../components/HintedInput/HintedInput';
import { INPUT_RULES, inputError } from '../../core/domain/services/authPolicy';
import { useDraft } from '../../hooks/useDraft';
import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ProfilePage from '../ProfilePage/ProfilePage';
import SearchPage from '../SearchPage/SearchPage';
import ChatPage from '../ChatPage/ChatPage';
import { useAuth } from '../../hooks/useAuth';
import { likeFeedItem } from '../../core/application/usecases/likeFeedItem';
import { unlikeFeedItem } from '../../core/application/usecases/unlikeFeedItem';
import { createApiFeedRepository } from '../../core/infrastructure/repositories/apiFeedRepository';
import { createApiUserRepository } from '../../core/infrastructure/repositories/apiUserRepository';
import { createApiWardrobeRepository } from '../../core/infrastructure/repositories/apiWardrobeRepository';
import { appConfig } from '../../config/appConfig';
import feedIcon from '../../assets/icons/feed.png';
import searchIcon from '../../assets/icons/search.png';
import profileIcon from '../../assets/icons/profile.png';
import commentsIcon from '../../assets/icons/comments.png';
import likeIcon from '../../assets/icons/like.png';
import downloadIcon from '../../assets/icons/download.png';
import wardrobeIcon from '../../assets/icons/wardrobe.png';
import './FeedPage.css';

const feedRepository = createApiFeedRepository();
const userRepository = createApiUserRepository();
const wardrobeRepository = createApiWardrobeRepository();
const FEED_PAGE_SIZE = 20;

const buildMediaFilePath = (mediaId) => {
  const numeric = Number(mediaId);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return '';
  }
  return `/api/v1/media/${numeric}/file`;
};

const toAbsoluteImageUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) {
    return raw;
  }
  if (raw.startsWith('/')) {
    return `${appConfig.apiBaseUrl}${raw}`;
  }
  return `${appConfig.apiBaseUrl}/${raw.replace(/^\/+/, '')}`;
};

const extractHashtags = (caption, metadata) => {
  if (Array.isArray(metadata?.hashtags) && metadata.hashtags.length > 0) {
    return metadata.hashtags
      .map((tag) => `#${String(tag || '').trim().replace(/^#/, '')}`)
      .filter((tag) => tag.length > 1);
  }
  const matches = String(caption || '').match(/#[\w\u0400-\u04FF-]+/g);
  return Array.isArray(matches) ? matches : [];
};

const collectMetadataGalleryUrls = (metadata) => {
  const md = metadata && typeof metadata === 'object' ? metadata : {};
  const urls = [];
  const add = (value) => {
    const normalized = toAbsoluteImageUrl(value);
    if (normalized && !urls.includes(normalized)) {
      urls.push(normalized);
    }
  };

  ['gallery_urls', 'image_urls', 'photos', 'preview_images'].forEach((key) => {
    const raw = md?.[key];
    if (Array.isArray(raw)) {
      raw.forEach(add);
    }
  });

  add(md?.image_url);
  add(md?.avatar_image_url);
  add(md?.cloth_image_url);
  return urls;
};

const stripSystemCaptionLines = (value) => {
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

const normalizeUsername = (value) => String(value || '').replace(/^@+/, '').trim().toLowerCase();

const buildPostPhotos = (item) => {
  const metadata = (item?.garment?.garment_metadata && typeof item.garment.garment_metadata === 'object')
    ? item.garment.garment_metadata
    : {};
  const primaryUrl = toAbsoluteImageUrl(buildMediaFilePath(item?.garment?.media_id));
  const avatarUrl = toAbsoluteImageUrl(buildMediaFilePath(metadata?.avatar_media_id));
  const clothUrl = toAbsoluteImageUrl(buildMediaFilePath(metadata?.cloth_media_id));
  const metadataGallery = collectMetadataGalleryUrls(metadata);

  const photos = [];
  const append = (value) => {
    const normalized = toAbsoluteImageUrl(value);
    if (normalized && !photos.includes(normalized)) {
      photos.push(normalized);
    }
  };

  append(primaryUrl);
  metadataGallery.forEach(append);
  append(avatarUrl);
  append(clothUrl);
  return photos;
};

const mapFeedItemToPost = (item) => {
  const postId = Number(item?.id);
  if (!Number.isInteger(postId) || postId <= 0) {
    return null;
  }

  const metadata = (item?.garment?.garment_metadata && typeof item.garment.garment_metadata === 'object')
    ? item.garment.garment_metadata
    : {};
  const photos = buildPostPhotos(item);
  if (!Array.isArray(photos) || photos.length === 0) {
    return null;
  }

  const rawUsername = String(item?.user?.username || '').trim();
  const profileUsername = rawUsername || `user_${item?.user_id || postId}`;
  const displayName = rawUsername || `Пользователь #${item?.user_id || postId}`;
  const avatarUrl =
    toAbsoluteImageUrl(item?.user?.avatar_url)
    || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=ff0000&color=fff`;
  const rawCaption = String(item?.caption || '').trim();
  const caption = stripSystemCaptionLines(rawCaption);
  const hashtags = extractHashtags(rawCaption, metadata);
  const sourceType = String(metadata?.source_type || metadata?.source || '').trim().toLowerCase();

  return {
    id: postId,
    feedItemId: postId,
    createdAt: item?.created_at || null,
    userId: Number(item?.user?.id || item?.user_id || 0),
    user: {
      name: displayName,
      username: `@${profileUsername}`,
      avatar: avatarUrl
    },
    photos,
    description: caption || 'Новый образ',
    likes: Number(item?.likes_count || 0),
    comments: Number(item?.comments_count || 0),
    shares: 0,
    tryOnCount: 0,
    tags: hashtags,
    isFollowingAuthor: Boolean(item?.author_is_followed),
    sourceType,
    sourcePostId: metadata?.source_post_id ? Number(metadata.source_post_id) : null,
    outfit: {
      brand: item?.garment?.brand || (sourceType === 'tryon' ? 'Swipelt Try-On' : 'Swipelt'),
      type: item?.garment?.title || `Образ #${postId}`,
      price: metadata?.price || 'Без цены',
      available: true
    }
  };
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

const FeedPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth } = useAuth();
  const shouldSkipEntrySplash = Boolean(location.state?.openTab && location.state.openTab !== 'feed');
  
  // Состояние для показа сплеша после входа
  const [showEntrySplash, setShowEntrySplash] = useState(!shouldSkipEntrySplash);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Состояния для постов и навигации
  const [currentPostIndex, setCurrentPostIndex] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isLiked, setIsLiked] = useState({});
  const [likeCounts, setLikeCounts] = useState({});
  const [commentCounts, setCommentCounts] = useState({});
  const [photoTransition, setPhotoTransition] = useState(false);
  const [savedWardrobeMap, setSavedWardrobeMap] = useState({});
  const [apiPosts, setApiPosts] = useState([]);
  const [feedHint, setFeedHint] = useState('');
  const [guestPrompt, setGuestPrompt] = useState({
    open: false,
    actionLabel: ''
  });
  const [followStateMap, setFollowStateMap] = useState({});
  const [followLoadingMap, setFollowLoadingMap] = useState({});
  const [commentsPanel, setCommentsPanel] = useState({
    open: false,
    postId: null,
    post: null,
    items: [],
    total: 0,
    loading: false,
    submitting: false,
    error: '',
    text: '',
    replyTo: null
  });
  const [commentText, setCommentText] = useDraft(`comment:${user?.id}:${commentsPanel.postId}`);
  const commentSubmitRef = useRef(false);
  const [likesPanel, setLikesPanel] = useState({
    open: false,
    title: '',
    items: [],
    total: 0,
    loading: false,
    error: ''
  });
  
  // Настройки из localStorage
  const [settings, setSettings] = useState(() => {
    const savedSettings = localStorage.getItem('appSettings');
    return savedSettings ? JSON.parse(savedSettings) : {
      theme: 'dark',
      showInstructions: true,
      hasChosenTheme: false
    };
  });
  
  // Состояние для активной вкладки
  const [activeTab, setActiveTab] = useState('feed');
  
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);
  const isFeedLoadingRef = useRef(false);
  const nextCursorRef = useRef(0);
  const hasMoreRef = useRef(true);
  const apiPostIdsRef = useRef(new Set());
  const feedPostsRef = useRef([]);
  const feedHintTimerRef = useRef(null);
  const endHintShownRef = useRef(false);

  // Эффект для скрытия сплеша
  useEffect(() => {
    if (!showEntrySplash) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setShowEntrySplash(false);
      }, 300);
    }, 450);
    
    return () => clearTimeout(timer);
  }, [showEntrySplash]);
  
  // Загружаем настройки темы
  useEffect(() => {
    const savedTheme = localStorage.getItem('appTheme') || 'dark';
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(`theme-${savedTheme}`);
    localStorage.setItem('appTheme', savedTheme);
    setSettings(prev => ({ ...prev, theme: savedTheme }));
  }, []);

  const feedPosts = apiPosts;

  useEffect(() => {
    feedPostsRef.current = feedPosts;
  }, [feedPosts]);

  useEffect(() => {
    setFollowStateMap((prev) => {
      const next = { ...prev };
      feedPosts.forEach((post) => {
        const normalizedUsername = String(post?.user?.username || '').replace(/^@+/, '').trim().toLowerCase();
        if (!normalizedUsername) {
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(next, normalizedUsername)) {
          next[normalizedUsername] = Boolean(post?.isFollowingAuthor);
        }
      });
      return next;
    });
  }, [feedPosts]);

  const mergeFeedStats = (feedItems) => {
    const items = Array.isArray(feedItems) ? feedItems : [];
    setLikeCounts((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        const postId = Number(item?.id);
        if (Number.isInteger(postId) && postId > 0) {
          next[postId] = Number(item?.likes_count || 0);
        }
      });
      return next;
    });
    setCommentCounts((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        const postId = Number(item?.id);
        if (Number.isInteger(postId) && postId > 0) {
          next[postId] = Number(item?.comments_count || 0);
        }
      });
      return next;
    });
    setIsLiked((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        const postId = Number(item?.id);
        if (Number.isInteger(postId) && postId > 0) {
          next[postId] = Boolean(item?.is_liked);
        }
      });
      return next;
    });
  };

  const loadApiFeedPage = async ({ reset = false } = {}) => {
    if (isFeedLoadingRef.current) {
      return;
    }
    if (!reset && !hasMoreRef.current) {
      return;
    }

    isFeedLoadingRef.current = true;
    if (!reset) {
      setFeedHint('Загружаем новые посты...');
    }
    try {
      const skip = reset ? 0 : nextCursorRef.current;
      const page = await feedRepository.fetchFeedPage({ skip, limit: FEED_PAGE_SIZE });
      const feedItems = Array.isArray(page?.items) ? page.items : [];

      mergeFeedStats(feedItems);

      if (reset) {
        apiPostIdsRef.current = new Set();
      }

      const mappedPosts = [];
      feedItems.forEach((item) => {
        const mapped = mapFeedItemToPost(item);
        if (!mapped) {
          return;
        }
        if (apiPostIdsRef.current.has(mapped.id)) {
          return;
        }
        apiPostIdsRef.current.add(mapped.id);
        mappedPosts.push(mapped);
      });

      setApiPosts((prev) => (reset ? mappedPosts : [...prev, ...mappedPosts]));

      const nextCursorValue = Number(page?.nextCursor);
      const normalizedCursor = Number.isFinite(nextCursorValue) ? nextCursorValue : (skip + feedItems.length);
      nextCursorRef.current = normalizedCursor;
      hasMoreRef.current = Boolean(page?.hasMore);
      if (page?.hasMore) {
        endHintShownRef.current = false;
        setFeedHint('');
      } else if (!endHintShownRef.current) {
        endHintShownRef.current = true;
        setFeedHint('Лента загружена полностью');
        if (feedHintTimerRef.current) {
          clearTimeout(feedHintTimerRef.current);
        }
        feedHintTimerRef.current = setTimeout(() => {
          setFeedHint('');
        }, 2200);
      }
    } catch (error) {
      if (reset) {
        setApiPosts([]);
      }
      setFeedHint('');
    } finally {
      isFeedLoadingRef.current = false;
    }
  };

  const showGuestPrompt = (actionLabel) => {
    const normalizedLabel = String(actionLabel || 'выполнить это действие');
    setGuestPrompt({
      open: true,
      actionLabel: normalizedLabel
    });
    setFeedHint(`Чтобы ${normalizedLabel}, войдите или зарегистрируйтесь`);
    if (feedHintTimerRef.current) {
      clearTimeout(feedHintTimerRef.current);
    }
    feedHintTimerRef.current = setTimeout(() => {
      setFeedHint('');
    }, 2600);
  };

  const requireNotGuest = (actionLabel) => {
    if (!user?.isGuest) {
      return true;
    }
    showGuestPrompt(actionLabel);
    return false;
  };

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const wardrobeItems = await wardrobeRepository.fetchWardrobeItems({ skip: 0, limit: 500 }).catch(() => []);
        if (!isMounted) {
          return;
        }
        const initialWardrobeMap = {};
        wardrobeItems.forEach((item) => {
          const postId = Number(item?.garment?.source_post_id);
          const garmentId = Number(item?.garment_id);
          if (Number.isInteger(postId) && postId > 0 && Number.isInteger(garmentId) && garmentId > 0) {
            initialWardrobeMap[postId] = garmentId;
          }
        });
        setSavedWardrobeMap(initialWardrobeMap);
      } catch (error) {
        if (isMounted) {
          setSavedWardrobeMap({});
        }
      }
      if (isMounted) {
        await loadApiFeedPage({ reset: true });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => () => {
    if (feedHintTimerRef.current) {
      clearTimeout(feedHintTimerRef.current);
    }
  }, []);

  // Получаем текущий пост и текущее фото
  const currentPost = activeTab === 'feed' ? feedPosts[currentPostIndex] : null;
  const isFirstPhoto = currentPhotoIndex === 0;
  const isFeedModalOpen = commentsPanel.open || likesPanel.open;

  useEffect(() => {
    const requestedTab = location.state?.openTab;
    if (!requestedTab) {
      return;
    }

    const allowedTabs = ['feed', 'search', 'chat', 'profile'];
    if (!allowedTabs.includes(requestedTab)) {
      return;
    }

    if (requestedTab === 'chat' && user?.isGuest) {
      showGuestPrompt('писать сообщения');
      setActiveTab('feed');
      return;
    }

    setActiveTab(requestedTab);
  }, [location.state, user?.isGuest]);

  // Функции для навигации с анимацией
  const nextPhoto = () => {
    if (currentPost && currentPhotoIndex < currentPost.photos.length - 1) {
      setPhotoTransition(true);
      setTimeout(() => {
        setCurrentPhotoIndex(prev => prev + 1);
        setTimeout(() => {
          setPhotoTransition(false);
        }, 50);
      }, 200);
    }
  };

  const prevPhoto = () => {
    if (currentPhotoIndex > 0) {
      setPhotoTransition(true);
      setTimeout(() => {
        setCurrentPhotoIndex(prev => prev - 1);
        setTimeout(() => {
          setPhotoTransition(false);
        }, 50);
      }, 200);
    }
  };

  const nextPost = () => {
    if (!feedPosts.length) {
      return;
    }

    if (currentPostIndex >= feedPosts.length - 3) {
      void loadApiFeedPage();
    }

    if (currentPostIndex < feedPosts.length - 1) {
      setPhotoTransition(true);
      setTimeout(() => {
        setCurrentPostIndex(prev => prev + 1);
        setCurrentPhotoIndex(0);
        setTimeout(() => {
          setPhotoTransition(false);
        }, 50);
      }, 200);
    } else if (hasMoreRef.current) {
      void (async () => {
        await loadApiFeedPage();
        const totalPosts = feedPostsRef.current.length;
        if (totalPosts > currentPostIndex + 1) {
          setPhotoTransition(true);
          setTimeout(() => {
            setCurrentPostIndex(prev => Math.min(prev + 1, totalPosts - 1));
            setCurrentPhotoIndex(0);
            setTimeout(() => {
              setPhotoTransition(false);
            }, 50);
          }, 200);
        }
      })();
    } else {
      // Если достигли конца - возвращаемся к первому посту
      setPhotoTransition(true);
      setTimeout(() => {
        setCurrentPostIndex(0);
        setCurrentPhotoIndex(0);
        setTimeout(() => {
          setPhotoTransition(false);
        }, 50);
      }, 200);
    }
  };

  const prevPost = () => {
    if (!feedPosts.length) {
      return;
    }
    if (currentPostIndex > 0) {
      setPhotoTransition(true);
      setTimeout(() => {
        setCurrentPostIndex(prev => prev - 1);
        setCurrentPhotoIndex(0);
        setTimeout(() => {
          setPhotoTransition(false);
        }, 50);
      }, 200);
    } else {
      // Если достигли начала - переходим к последнему посту
      setPhotoTransition(true);
      setTimeout(() => {
        setCurrentPostIndex(feedPosts.length - 1);
        setCurrentPhotoIndex(0);
        setTimeout(() => {
          setPhotoTransition(false);
        }, 50);
      }, 200);
    }
  };

  // Обработка свайпов для мобильных
  useEffect(() => {
    if (!showEntrySplash && activeTab === 'feed' && !isFeedModalOpen) {
      const handleTouchStart = (e) => {
        if (isSwiping.current) return;
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        isSwiping.current = true;
      };

      const handleTouchMove = (e) => {
        if (!isSwiping.current) return;
        e.preventDefault();
      };

      const handleTouchEnd = (e) => {
        if (!isSwiping.current) return;
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchStartX.current - touchEndX;
        const diffY = touchStartY.current - touchEndY;

        setTimeout(() => {
          isSwiping.current = false;
        }, 100);

        const minSwipeDistance = 50;
        const isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);
        const isSwipeLongEnough = Math.abs(diffX) > minSwipeDistance || Math.abs(diffY) > minSwipeDistance;

        if (isSwipeLongEnough) {
          if (isHorizontalSwipe) {
            if (diffX > 0) {
              // Свайп влево - следующее фото
              nextPhoto();
            } else {
              // Свайп вправо - назад/примерка
              if (currentPhotoIndex > 0) {
                prevPhoto();
              } else if (isFirstPhoto) {
                handleTryOn(currentPost.id);
              }
            }
          } else {
            if (diffY > 0) {
              nextPost(); // Свайп вниз
            } else {
              prevPost(); // Свайп вверх
            }
          }
        }
      };

      const videoFeed = document.querySelector('.photo-feed');
      if (videoFeed) {
        videoFeed.addEventListener('touchstart', handleTouchStart, { passive: false });
        videoFeed.addEventListener('touchmove', handleTouchMove, { passive: false });
        videoFeed.addEventListener('touchend', handleTouchEnd, { passive: false });
      }

      return () => {
        const videoFeed = document.querySelector('.photo-feed');
        if (videoFeed) {
          videoFeed.removeEventListener('touchstart', handleTouchStart);
          videoFeed.removeEventListener('touchmove', handleTouchMove);
          videoFeed.removeEventListener('touchend', handleTouchEnd);
        }
      };
    }
  }, [showEntrySplash, currentPostIndex, currentPhotoIndex, currentPost, isFirstPhoto, activeTab, isFeedModalOpen]);

  // Обработка клавиатуры для ПК
  useEffect(() => {
    if (!showEntrySplash) {
      const handleKeyDown = (e) => {
        if (isFeedModalOpen) {
          return;
        }
        if (activeTab === 'feed') {
          switch(e.key.toLowerCase()) {
            case 'arrowright':
            case 'd':
              e.preventDefault();
              nextPhoto();
              break;
            case 'arrowleft':
            case 'a':
              e.preventDefault();
              if (currentPhotoIndex > 0) {
                prevPhoto();
              } else if (isFirstPhoto) {
                handleTryOn(currentPost.id);
              }
              break;
            case 'arrowup':
            case 'w':
              e.preventDefault();
              prevPost();
              break;
            case 'arrowdown':
            case 's':
              e.preventDefault();
              nextPost();
              break;
            case 'i':
            case '?':
              e.preventDefault();
              setSettings(prev => ({
                ...prev,
                showInstructions: !prev.showInstructions
              }));
              break;
          }
        }
      };

      const handleWheel = (e) => {
        if (isFeedModalOpen) {
          return;
        }
        if (activeTab !== 'feed') {
          return;
        }

        if (Math.abs(e.deltaX) > 24 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          e.preventDefault();
          if (e.deltaX > 0) {
            nextPhoto();
          } else if (currentPhotoIndex > 0) {
            prevPhoto();
          } else if (isFirstPhoto) {
            handleTryOn(currentPost.id);
          }
          return;
        }

        if (Math.abs(e.deltaY) > 30) {
          e.preventDefault();
          if (e.deltaY > 0) {
            nextPost();
          } else {
            prevPost();
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('wheel', handleWheel, { passive: false });

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('wheel', handleWheel);
      };
    }
  }, [showEntrySplash, currentPostIndex, currentPhotoIndex, currentPost, isFirstPhoto, activeTab, settings.showInstructions, isFeedModalOpen]);

  // Сохраняем настройки в localStorage
  useEffect(() => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
  }, [settings]);

  const handleLike = async (postId) => {
    if (!requireNotGuest('лайкать посты')) {
      return;
    }
    const normalizedPostId = Number(postId);
    if (!Number.isInteger(normalizedPostId) || normalizedPostId <= 0) {
      return;
    }
    const wasLiked = Boolean(isLiked[postId]);

    setIsLiked((prev) => ({
      ...prev,
      [postId]: !wasLiked
    }));
    setLikeCounts((prev) => ({
      ...prev,
      [postId]: Math.max(0, (prev[postId] ?? 0) + (wasLiked ? -1 : 1))
    }));

    try {
      if (wasLiked) {
        await unlikeFeedItem(feedRepository, normalizedPostId);
      } else {
        await likeFeedItem(feedRepository, normalizedPostId);
      }
    } catch (error) {
      setIsLiked((prev) => ({
        ...prev,
        [postId]: wasLiked
      }));
      setLikeCounts((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] ?? 0) + (wasLiked ? 1 : -1))
      }));
      return;
    }

    if (!wasLiked) {
      const heart = document.createElement('div');
      heart.innerHTML = '❤️';
      heart.style.position = 'fixed';
      heart.style.fontSize = '3rem';
      heart.style.pointerEvents = 'none';
      heart.style.zIndex = '1000';
      heart.style.left = '50%';
      heart.style.top = '50%';
      heart.style.transform = 'translate(-50%, -50%)';
      heart.style.animation = 'heartFloat 1s ease-out forwards';
      document.body.appendChild(heart);
      setTimeout(() => {
        document.body.removeChild(heart);
      }, 1000);
    }
  };

  const handleTryOn = (postId) => {
    if (!requireNotGuest('запускать примерку')) {
      return;
    }
    const post = feedPostsRef.current.find((p) => Number(p.id) === Number(postId));
    if (!post) {
      return;
    }
    const photos = Array.isArray(post?.photos) ? post.photos : [];
    const clothPhoto = photos.length > 0 ? photos[photos.length - 1] : '';
    navigate('/try-on', { 
      state: { 
        postId, 
        outfit: post.outfit, 
        user: post.user,
        photo: clothPhoto,
        clothPhoto,
        autoStart: false
      } 
    });
  };

  const handleWardrobeToggle = async (post) => {
    if (!requireNotGuest('сохранять вещи в гардероб')) {
      return;
    }
    const currentGarmentId = savedWardrobeMap[post.id];

    try {
      if (currentGarmentId) {
        await wardrobeRepository.removeByGarmentId(currentGarmentId);
        setSavedWardrobeMap((prev) => {
          const next = { ...prev };
          delete next[post.id];
          return next;
        });
        return;
      }

      const response = await wardrobeRepository.saveFromPost({
        postId: post.id,
        title: post.outfit?.type || `Образ #${post.id}`,
        brand: post.outfit?.brand || null,
        imageUrl: post.photos?.[0] || '',
        category: post.tags?.[0]?.replace('#', '') || null,
        price: post.outfit?.price || null
      });

      const garmentId = Number(response?.garment_id);
      if (Number.isInteger(garmentId) && garmentId > 0) {
        setSavedWardrobeMap((prev) => ({ ...prev, [post.id]: garmentId }));
      }
    } catch (error) {
      // Keep optimistic UI unchanged on error.
    }
  };

  const handleOpenLikesPanel = async (postId) => {
    const normalizedId = Number(postId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      return;
    }
    setLikesPanel({
      open: true,
      title: `Лайки поста #${normalizedId}`,
      items: [],
      total: 0,
      loading: true,
      error: ''
    });
    try {
      const payload = await feedRepository.fetchFeedItemLikes(normalizedId, { limit: 300 });
      setLikesPanel({
        open: true,
        title: `Лайки поста #${normalizedId}`,
        items: Array.isArray(payload?.items) ? payload.items : [],
        total: Number(payload?.total || 0),
        loading: false,
        error: ''
      });
    } catch (error) {
      setLikesPanel({
        open: true,
        title: `Лайки поста #${normalizedId}`,
        items: [],
        total: 0,
        loading: false,
        error: error?.message || 'Не удалось загрузить лайки'
      });
    }
  };

  const handleExternalCommentCreated = (postId, increment = 1) => {
    const normalizedId = Number(postId);
    const normalizedInc = Number(increment);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      return;
    }
    if (!Number.isFinite(normalizedInc) || normalizedInc <= 0) {
      return;
    }
    setCommentCounts((prev) => ({
      ...prev,
      [normalizedId]: Math.max(0, Number(prev[normalizedId] || 0) + normalizedInc)
    }));
  };

  const handleComment = async (postId) => {
    if (commentSubmitRef.current) return;
    if (!requireNotGuest('оставлять комментарии')) {
      return;
    }
    const normalizedId = Number(postId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      return;
    }
    const selectedPost = feedPostsRef.current.find((post) => Number(post?.id) === normalizedId) || null;
    setCommentsPanel({
      open: true,
      postId: normalizedId,
      post: selectedPost,
      items: [],
      total: Number(commentCounts[normalizedId] ?? 0),
      loading: true,
      submitting: false,
      error: '',
      text: '',
      replyTo: null
    });

    try {
      const payload = await feedRepository.fetchFeedItemComments(normalizedId, { limit: 200 });
      const normalizedItems = Array.isArray(payload?.items) ? payload.items : [];
      const total = Number(payload?.total || normalizedItems.length || 0);
      setCommentsPanel((prev) => ({
        ...prev,
        items: normalizedItems,
        total,
        loading: false,
        error: '',
        replyTo: null
      }));
      setCommentCounts((prev) => ({
        ...prev,
        [normalizedId]: total
      }));
    } catch (error) {
      setCommentsPanel((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || 'Не удалось загрузить комментарии'
      }));
    }
  };

  const handleSubmitComment = async () => {
    if (commentSubmitRef.current) return;
    if (!requireNotGuest('оставлять комментарии')) {
      return;
    }
    const postId = Number(commentsPanel.postId);
    const text = String(commentText || '').trim();
    const commentError = inputError('comment', commentText);
    if (!Number.isInteger(postId) || postId <= 0) {
      return;
    }
    if (commentError) {
      setCommentsPanel((prev) => ({
        ...prev,
        error: commentError
      }));
      return;
    }

    commentSubmitRef.current = true;
    setCommentsPanel((prev) => ({
      ...prev,
      submitting: true,
      error: ''
    }));

    try {
      const created = await feedRepository.addFeedItemComment(postId, { text });
      setCommentText('');
      setCommentsPanel((prev) => {
        const nextItems = [...(Array.isArray(prev.items) ? prev.items : []), created];
        return {
          ...prev,
          submitting: false,
          text: '',
          items: nextItems,
          total: Number(prev.total || 0) + 1,
          error: '',
          replyTo: null,
        };
      });
      setCommentCounts((prev) => ({
        ...prev,
        [postId]: Number(prev[postId] || 0) + 1
      }));
    } catch (error) {
      setCommentsPanel((prev) => ({
        ...prev,
        submitting: false,
        error: error?.message || 'Не удалось отправить комментарий'
      }));
    } finally {
      commentSubmitRef.current = false;
    }
  };

  const handleReplyToComment = (comment) => {
    if (!requireNotGuest('отвечать на комментарии')) {
      return;
    }
    const username = String(comment?.username || '').replace(/^@+/, '').trim();
    if (!username) {
      return;
    }
    const mention = `@${username}, `;
    setCommentText(`${mention}${String(commentText).replace(/^@\S+,\s*/, '')}`);
    setCommentsPanel((prev) => {
      const currentText = String(prev.text || '');
      const cleanedText = currentText.replace(/^@\S+,\s*/, '');
      return {
        ...prev,
        replyTo: {
          id: Number(comment?.id || 0),
          username,
        },
        text: `${mention}${cleanedText}`,
      };
    });
  };

  const clearReplyTarget = () => {
    setCommentText(String(commentText).replace(/^@\S+,\s*/, ''));
    setCommentsPanel((prev) => ({
      ...prev,
      replyTo: null,
      text: String(prev.text || '').replace(/^@\S+,\s*/, ''),
    }));
  };

  const handleToggleCommentLike = async (commentId) => {
    if (!requireNotGuest('лайкать комментарии')) {
      return;
    }
    const normalizedCommentId = Number(commentId);
    if (!Number.isInteger(normalizedCommentId) || normalizedCommentId <= 0) {
      return;
    }

    const currentItem = commentsPanel.items.find((item) => Number(item?.id) === normalizedCommentId);
    if (!currentItem) {
      return;
    }

    const wasLiked = Boolean(currentItem.is_liked);
    const previousLikesCount = Number(currentItem.likes_count || 0);
    setCommentsPanel((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (Number(item?.id) !== normalizedCommentId) {
          return item;
        }
        return {
          ...item,
          is_liked: !wasLiked,
          likes_count: Math.max(0, Number(item.likes_count || 0) + (wasLiked ? -1 : 1))
        };
      })
    }));

    try {
      const payload = wasLiked
        ? await feedRepository.unlikeComment(normalizedCommentId)
        : await feedRepository.likeComment(normalizedCommentId);
      setCommentsPanel((prev) => ({
        ...prev,
        items: prev.items.map((item) => {
          if (Number(item?.id) !== normalizedCommentId) {
            return item;
          }
          return {
            ...item,
            is_liked: Boolean(payload?.is_liked),
            likes_count: Number(payload?.likes_count || 0)
          };
        })
      }));
    } catch (error) {
      setCommentsPanel((prev) => ({
        ...prev,
        items: prev.items.map((item) => {
          if (Number(item?.id) !== normalizedCommentId) {
            return item;
          }
          return {
            ...item,
            is_liked: wasLiked,
            likes_count: Math.max(0, previousLikesCount)
          };
        })
      }));
    }
  };

  const handleShare = (postId) => {
    console.log('Share post:', postId);
    if (navigator.share) {
      navigator.share({
        title: 'Swipelt - Виртуальная примерка',
        text: 'Посмотри этот образ в Swipelt!',
        url: window.location.href,
      });
    }
  };

  const handleFollow = async (username) => {
    if (!requireNotGuest('подписываться на пользователей')) {
      return;
    }
    const normalized = String(username || '').replace(/^@+/, '').trim().toLowerCase();
    if (!normalized) {
      return;
    }
    if (followLoadingMap[normalized]) {
      return;
    }
    const currentState = Boolean(followStateMap[normalized]);

    setFollowLoadingMap((prev) => ({ ...prev, [normalized]: true }));
    setFollowStateMap((prev) => ({ ...prev, [normalized]: !currentState }));
    try {
      if (currentState) {
        await userRepository.unfollowUser(normalized);
      } else {
        await userRepository.followUser(normalized);
      }
    } catch (error) {
      setFollowStateMap((prev) => ({ ...prev, [normalized]: currentState }));
    } finally {
      setFollowLoadingMap((prev) => ({ ...prev, [normalized]: false }));
    }
  };

  const openUserProfile = (post) => {
    const normalized = String(post?.user?.username || '').replace(/^@+/, '').trim();
    if (!normalized) {
      return;
    }
    const currentUsername = String(user?.username || '').trim().toLowerCase();
    if (currentUsername && normalized.toLowerCase() === currentUsername) {
      handleTabChange('profile');
      return;
    }
    const authorUsername = normalizeUsername(post?.user?.username);
    const fallbackPosts = feedPostsRef.current
      .filter((item) => normalizeUsername(item?.user?.username) === authorUsername)
      .map((item) => ({
        feed_item_id: item.id,
        caption: item.description,
        image_url: item.photos?.[0] || '',
        likes_count: likeCounts[item.id] ?? 0,
        comments_count: commentCounts[item.id] ?? 0,
        created_at: item.createdAt || new Date().toISOString(),
        source_post_id: item.sourcePostId ?? null,
        source_type: item.sourceType ?? null,
        hashtags: Array.isArray(item.tags)
          ? item.tags.map((tag) => String(tag || '').replace(/^#/, '').trim()).filter(Boolean)
          : []
      }));
    navigate(`/u/${encodeURIComponent(normalized)}`, {
      state: {
        fallbackProfile: {
          username: normalized,
          avatar_url: post?.user?.avatar || '',
          posts_count: fallbackPosts.length,
          likes_count: fallbackPosts.reduce((acc, item) => acc + Number(item.likes_count || 0), 0),
          wardrobe_count: 0,
          followers_count: 0,
          following_count: 0,
          is_following: false,
          posts: fallbackPosts
        }
      }
    });
  };

  const handleCamera = () => {
    if (!requireNotGuest('запускать примерку')) {
      return;
    }
    navigate('/try-on');
  };

  const handleLogoClick = () => {
    setPhotoTransition(true);
    setTimeout(() => {
      setActiveTab('feed');
      setCurrentPostIndex(0);
      setCurrentPhotoIndex(0);
      setTimeout(() => {
        setPhotoTransition(false);
      }, 50);
    }, 160);
    void loadApiFeedPage({ reset: true });
  };

  const handlePhotoClick = (index) => {
    setPhotoTransition(true);
    setTimeout(() => {
      setCurrentPhotoIndex(index);
      setTimeout(() => {
        setPhotoTransition(false);
      }, 50);
    }, 200);
  };

  // Переключение между вкладками
  const handleTabChange = (tab) => {
    if (tab === 'chat' && !requireNotGuest('писать сообщения')) {
      return;
    }
    setActiveTab(tab);
  };

  // Показать инструкцию
  const showInstructions = () => {
    setSettings(prev => ({ ...prev, showInstructions: true }));
  };

  // Скрыть инструкцию
  const hideInstructions = () => {
    setSettings(prev => ({ ...prev, showInstructions: false }));
  };

  // Если показываем сплеш
  if (showEntrySplash) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        opacity: isTransitioning ? 0 : 1,
        transform: isTransitioning ? 'translateY(-20px)' : 'translateY(0)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        pointerEvents: 'none'
      }}>
        <div style={{
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '3rem',
            fontWeight: 'bold',
            background: 'linear-gradient(45deg, #ff0000, #ff3333, #ff6666, #ff3333, #ff0000)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            backgroundSize: '200% auto',
            animation: 'gradientFlow 3s ease-in-out infinite',
            marginBottom: '20px'
          }}>
            Swipelt
          </div>
          <div style={{
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: '1.2rem',
            opacity: isTransitioning ? 0 : 1,
            transition: 'opacity 0.3s ease'
          }}>
            Загрузка ленты...
          </div>
        </div>
        <style>{`
          @keyframes gradientFlow {
            0% { background-position: 0% center; }
            50% { background-position: 100% center; }
            100% { background-position: 0% center; }
          }
        `}</style>
      </div>
    );
  }

  // Отображаем активную вкладку
  const renderContent = () => {
    switch (activeTab) {
      case 'search':
        return <SearchPage />;
      case 'chat':
        return <ChatPage />;
      case 'profile':
        return <ProfilePage onCommentCreated={handleExternalCommentCreated} />;
      case 'feed':
      default:
        return (
          <div className="photo-feed">
            {feedPosts.map((post, index) => (
              <div
                key={post.id}
                className={`photo-container ${index === currentPostIndex ? 'active' : ''}`}
                style={{
                  transform: `translateY(${(index - currentPostIndex) * 100}vh)`,
                  opacity: index === currentPostIndex ? 1 : 0.7
                }}
              >
                <div className="photo-wrapper">
                  {currentPost.id === post.id && post.photos.map((photo, photoIndex) => (
                    <img
                      key={photoIndex}
                      src={photo}
                      alt={`Фото ${photoIndex + 1} из ${post.photos.length}`}
                      className={`photo-content ${photoIndex === currentPhotoIndex ? 'active' : ''} ${
                        photoTransition ? 'transitioning' : ''
                      }`}
                      loading="lazy"
                      style={{
                        transform: photoIndex === currentPhotoIndex ? 'translateX(0)' : 
                                 photoIndex < currentPhotoIndex ? 'translateX(-100%)' : 'translateX(100%)'
                      }}
                    />
                  ))}

                  {currentPost.id === post.id && post.photos.length > 1 && (
                    <div className="photo-indicator">
                      {post.photos.map((_, photoIndex) => (
                        <div
                          key={photoIndex}
                          className={`photo-dot ${photoIndex === currentPhotoIndex ? 'active' : ''}`}
                          onClick={() => handlePhotoClick(photoIndex)}
                          title={`Фото ${photoIndex + 1}`}
                        />
                      ))}
                    </div>
                  )}

                  <div className="photo-overlay"></div>

                  <div className="post-content-wrapper">
                    <div className="post-content">
                      <div className="post-header">
                        <div className="user-info">
                          <img
                            src={post.user.avatar}
                            alt={post.user.name}
                            className="user-avatar"
                            onClick={() => openUserProfile(post)}
                          />
                          <div className="user-details">
                            <h3 className="user-name" onClick={() => openUserProfile(post)}>{post.user.name}</h3>
                            <p className="user-username" onClick={() => openUserProfile(post)}>
                              {post.user.username}
                              {(() => {
                                const postUsername = String(post?.user?.username || '').replace(/^@+/, '').trim().toLowerCase();
                                const currentUsername = String(user?.username || '').trim().toLowerCase();
                                const isOwnPost = Boolean(postUsername) && Boolean(currentUsername) && postUsername === currentUsername;
                                return isOwnPost ? <span className="self-chip">Вы</span> : null;
                              })()}
                            </p>
                          </div>
                        </div>
                        {(() => {
                          const postUsername = String(post?.user?.username || '').replace(/^@+/, '').trim().toLowerCase();
                          const currentUsername = String(user?.username || '').trim().toLowerCase();
                          const isOwnPost = Boolean(postUsername) && Boolean(currentUsername) && postUsername === currentUsername;
                          const isFollowing = Boolean(followStateMap[postUsername]);
                          const isUpdating = Boolean(followLoadingMap[postUsername]);
                          return (
                            !isOwnPost ? (
                              <button
                                className={`follow-btn ${isFollowing ? 'is-following' : ''}`}
                                onClick={() => {
                                  void handleFollow(post.user.username);
                                }}
                                disabled={isUpdating}
                              >
                                {isUpdating ? '...' : (isFollowing ? 'Вы подписаны' : 'Подписаться')}
                              </button>
                            ) : null
                          );
                        })()}
                      </div>

                      <div className="post-description">
                        <p className="description-text">{post.description}</p>
                        <div className="post-tags">
                          {post.tags.map((tag, i) => (
                            <span key={i} className="tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="outfit-info">
                        <div className="outfit-item">
                          <span className="outfit-icon">🏷️</span>
                          <span className="outfit-text">{post.outfit.brand}</span>
                        </div>
                        <div className="outfit-item">
                          <span className="outfit-icon">💰</span>
                          <span className="outfit-text">{post.outfit.price}</span>
                        </div>
                        <div className={`outfit-item ${post.outfit.available ? 'available' : 'sold-out'}`}>
                          <span className="outfit-icon">
                            {post.outfit.available ? '✅' : '❌'}
                          </span>
                          <span className="outfit-text">
                            {post.outfit.available ? 'В наличии' : 'Нет в наличии'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="photo-actions-right">
                  <button 
                    className={`action-btn ${isLiked[post.id] ? 'liked' : ''}`} 
                    onClick={() => handleLike(post.id)} 
                    title="Лайк"
                  >
                    <span className="action-icon">
                      <img src={likeIcon} alt="" className="action-icon-img" />
                    </span>
                    <span className="action-count">
                      {likeCounts[post.id] ?? post.likes}
                    </span>
                  </button>

                  <button 
                    className="action-btn" 
                    onClick={() => { void handleComment(post.id); }} 
                    title="Комментарии"
                  >
                    <span className="action-icon">
                      <img src={commentsIcon} alt="" className="action-icon-img" />
                    </span>
                    <span className="action-count">{commentCounts[post.id] ?? 0}</span>
                  </button>

                  <button 
                    className="action-btn" 
                    onClick={() => handleShare(post.id)} 
                    title="Поделиться"
                  >
                    <span className="action-icon">
                      <img src={downloadIcon} alt="" className="action-icon-img" />
                    </span>
                    <span className="action-count">{post.shares}</span>
                  </button>

                  {currentPost.id === post.id && isFirstPhoto && (
                    <button 
                      className="action-btn try-on-action" 
                      onClick={() => handleTryOn(post.id)} 
                      title="Примерять эту одежду"
                    >
                      <span className="action-icon">
                        <img src={wardrobeIcon} alt="" className="action-icon-img" />
                      </span>
                      <span className="action-text">Примерка</span>
                      <span className="action-count">{post.tryOnCount}</span>
                    </button>
                  )}

                  <button
                    className={`action-btn wardrobe-action ${savedWardrobeMap[post.id] ? 'saved' : ''}`}
                    onClick={() => handleWardrobeToggle(post)}
                    title={savedWardrobeMap[post.id] ? 'Убрать из гардероба' : 'Сохранить в гардероб'}
                  >
                    <span className="action-icon">
                      <img src={wardrobeIcon} alt="" className="action-icon-img" />
                    </span>
                    <span className="action-text">{savedWardrobeMap[post.id] ? 'Сохранено' : 'Гардероб'}</span>
                  </button>
                </div>
              </div>
            ))}
            
            {feedHint && (
              <div
                className={`feed-meta-hint ${/войдите или зарегистрируйтесь/i.test(feedHint) ? 'feed-meta-hint--auth' : ''}`}
              >
                {feedHint}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="tiktok-container">
      <nav className="top-nav">
        <button type="button" className="logo-btn" onClick={handleLogoClick}>
          <span className="logo">Swipelt</span>
        </button>
      </nav>

      <div className="feed-tab-content">
        {renderContent()}
      </div>

      <nav className="bottom-nav">
        <button 
          className={`bottom-nav-btn ${activeTab === 'feed' ? 'active' : ''}`} 
          onClick={() => handleTabChange('feed')}
          title="Лента"
        >
          <span className="nav-icon">
            <img src={feedIcon} alt="" className="nav-icon-img" />
          </span>
          <span className="nav-label">Лента</span>
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'search' ? 'active' : ''}`} 
          onClick={() => handleTabChange('search')}
          title="Поиск"
        >
          <span className="nav-icon">
            <img src={searchIcon} alt="" className="nav-icon-img" />
          </span>
          <span className="nav-label">Поиск</span>
        </button>
        <button className="camera-btn" onClick={handleCamera} title="Новая примерка">
          <span className="camera-icon">
            <img src={wardrobeIcon} alt="" className="camera-icon-img" />
          </span>
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'chat' ? 'active' : ''}`} 
          onClick={() => handleTabChange('chat')}
          title="Чаты"
        >
          <span className="nav-icon">
            <img src={commentsIcon} alt="" className="nav-icon-img" />
          </span>
          <span className="nav-label">Чаты</span>
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'profile' ? 'active' : ''}`} 
          onClick={() => handleTabChange('profile')}
          title="Профиль"
        >
          <span className="nav-icon">
            <img src={profileIcon} alt="" className="nav-icon-img" />
          </span>
          <span className="nav-label">Профиль</span>
        </button>
      </nav>

      {commentsPanel.open && (
        <div
          className="feed-modal-backdrop"
          onClick={() => setCommentsPanel((prev) => ({ ...prev, open: false, replyTo: null }))}
        >
          <div className="feed-modal-sheet feed-modal-sheet--comments" onClick={(event) => event.stopPropagation()}>
            <div className="feed-modal-header">
              <div>
                <h3>Комментарии</h3>
                <p>{commentsPanel.post?.user?.username || ''}</p>
              </div>
              <button
                type="button"
                className="feed-modal-close"
                onClick={() => setCommentsPanel((prev) => ({ ...prev, open: false, replyTo: null }))}
              >
                ×
              </button>
            </div>

            <div className="feed-modal-meta">
              <button
                type="button"
                className="feed-modal-meta-btn"
                onClick={() => { void handleOpenLikesPanel(commentsPanel.postId); }}
              >
                {likeCounts[commentsPanel.postId] ?? commentsPanel.post?.likes ?? 0} лайков
              </button>
              <span>{commentCounts[commentsPanel.postId] ?? commentsPanel.total ?? 0} комментариев</span>
            </div>

            {commentsPanel.loading && <div className="feed-comments-empty">Загружаем комментарии...</div>}
            {!commentsPanel.loading && commentsPanel.error && (
              <div className="feed-comments-error">{commentsPanel.error}</div>
            )}
            {!commentsPanel.loading && !commentsPanel.error && commentsPanel.items.length === 0 && (
              <div className="feed-comments-empty">Пока нет комментариев</div>
            )}
            {!commentsPanel.loading && !commentsPanel.error && commentsPanel.items.length > 0 && (
              <div className="feed-comments-list">
                {commentsPanel.items.map((comment) => (
                  <div key={comment.id} className="feed-comment-item">
                    <img
                      src={comment.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.username)}&background=ff0000&color=fff`}
                      alt={comment.username}
                    />
                    <div className="feed-comment-body">
                      <div className="feed-comment-head">
                        <strong>@{comment.username}</strong>
                        <span>{formatRelativeTime(comment.created_at)}</span>
                      </div>
                      <p>{comment.text}</p>
                      <div className="feed-comment-actions">
                        <button
                          type="button"
                          className={`feed-comment-like-btn ${comment.is_liked ? 'is-liked' : ''}`}
                          onClick={() => { void handleToggleCommentLike(comment.id); }}
                        >
                          {comment.is_liked ? '♥' : '♡'} {Number(comment.likes_count || 0)}
                        </button>
                        <button
                          type="button"
                          className="feed-comment-reply-btn"
                          onClick={() => handleReplyToComment(comment)}
                        >
                          Ответить
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {commentsPanel.replyTo && (
              <div className="feed-reply-target">
                <span>Ответ для @{commentsPanel.replyTo.username}</span>
                <button type="button" onClick={clearReplyTarget}>×</button>
              </div>
            )}

            <div className="feed-comment-form">
              <HintedInput as="textarea"
                maxLength={1000}
                hint={INPUT_RULES.comment}
                  disabled={commentsPanel.submitting}
                  value={commentText}
                placeholder={commentsPanel.replyTo ? `Ответ для @${commentsPanel.replyTo.username}...` : 'Оставьте комментарий...'}
                onChange={(event) => setCommentText(event.target.value)}
              />
              <button
                type="button"
                className="feed-comment-submit"
                onClick={() => { void handleSubmitComment(); }}
                disabled={commentsPanel.submitting}
              >
                {commentsPanel.submitting ? '...' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {likesPanel.open && (
        <div className="feed-modal-backdrop" onClick={() => setLikesPanel((prev) => ({ ...prev, open: false }))}>
          <div className="feed-modal-sheet feed-modal-sheet--small" onClick={(event) => event.stopPropagation()}>
            <div className="feed-modal-header">
              <div>
                <h3>{likesPanel.title || 'Лайки'}</h3>
                <p>{likesPanel.total} пользователей</p>
              </div>
              <button
                type="button"
                className="feed-modal-close"
                onClick={() => setLikesPanel((prev) => ({ ...prev, open: false }))}
              >
                ×
              </button>
            </div>

            {likesPanel.loading && <div className="feed-comments-empty">Загружаем список...</div>}
            {!likesPanel.loading && likesPanel.error && <div className="feed-comments-error">{likesPanel.error}</div>}
            {!likesPanel.loading && !likesPanel.error && likesPanel.items.length === 0 && (
              <div className="feed-comments-empty">Пока никто не лайкнул этот пост</div>
            )}
            {!likesPanel.loading && !likesPanel.error && likesPanel.items.length > 0 && (
              <div className="feed-comments-list">
                {likesPanel.items.map((likeItem) => (
                  <button
                    key={`${likeItem.user_id}-${likeItem.liked_at}`}
                    type="button"
                    className="feed-like-user"
                    onClick={() => navigate(`/u/${encodeURIComponent(likeItem.username)}`)}
                  >
                    <img
                      src={likeItem.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(likeItem.username)}&background=ff0000&color=fff`}
                      alt={likeItem.username}
                    />
                    <div>
                      <strong>@{likeItem.username}</strong>
                      <span>{formatDateTime(likeItem.liked_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {guestPrompt.open && (
        <div className="feed-modal-backdrop" onClick={() => setGuestPrompt((prev) => ({ ...prev, open: false }))}>
          <div className="feed-modal-sheet feed-modal-sheet--small" onClick={(event) => event.stopPropagation()}>
            <div className="feed-modal-header">
              <div>
                <h3>Требуется аккаунт</h3>
                <p>Чтобы {guestPrompt.actionLabel || 'выполнить это действие'}, войдите или зарегистрируйтесь.</p>
              </div>
              <button
                type="button"
                className="feed-modal-close"
                onClick={() => setGuestPrompt((prev) => ({ ...prev, open: false }))}
              >
                ×
              </button>
            </div>
            <div className="feed-guest-actions">
              <button
                type="button"
                className="feed-comment-submit"
                onClick={() => {
                  setGuestPrompt((prev) => ({ ...prev, open: false }));
                  clearAuth();
                  navigate('/login');
                }}
              >
                Войти
              </button>
              <button
                type="button"
                className="feed-modal-meta-btn"
                onClick={() => {
                  setGuestPrompt((prev) => ({ ...prev, open: false }));
                  clearAuth();
                  navigate('/register');
                }}
              >
                Регистрация
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Инструкция (только на ленте) */}
      {settings.showInstructions && activeTab === 'feed' && (
        <div className="instructions-container">
          <div className="instructions-content">
            <button 
              className="close-instructions-btn" 
              onClick={hideInstructions}
              title="Закрыть инструкцию"
            >
              ×
            </button>
            
            <div className="instructions-scroll">
              <h3 className="instructions-title">📱 Управление</h3>
              
              <div className="instructions-section">
                <h4 className="instructions-subtitle">Для ПК:</h4>
                <div className="instruction-item">
                  <span className="instruction-key">→ D</span>
                  <span className="instruction-text">Фото вперед</span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-key">← A</span>
                  <span className="instruction-text">Назад / Примерка</span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-key">↑ W</span>
                  <span className="instruction-text">Предыдущий пост</span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-key">↓ S</span>
                  <span className="instruction-text">Следующий пост</span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-key">I</span>
                  <span className="instruction-text">Инструкция</span>
                </div>
              </div>

              <div className="instructions-section">
                <h4 className="instructions-subtitle">Для телефона:</h4>
                <div className="instruction-item">
                  <span className="instruction-key">←</span>
                  <span className="instruction-text">Фото вперед</span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-key">→</span>
                  <span className="instruction-text">Назад / Примерка</span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-key">↑</span>
                  <span className="instruction-text">Предыдущий пост</span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-key">↓</span>
                  <span className="instruction-text">Следующий пост</span>
                </div>
              </div>

              <div className="instructions-note">
                <span className="note-icon">💡</span>
                Примерка только на первом фото
              </div>
            </div>
            
            <div className="instructions-footer">
              <button 
                className="instructions-hide-btn"
                onClick={hideInstructions}
              >
                Не показывать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Кнопка для показа инструкции */}
      {!settings.showInstructions && activeTab === 'feed' && (
        <button 
          className="show-instructions-btn" 
          onClick={showInstructions}
          title="Показать инструкцию"
        >
          ?
        </button>
      )}

      <style jsx="true">{`
        @keyframes heartFloat {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -100px) scale(1.5);
          }
        }
      `}</style>
    </div>
  );
};

export default FeedPage;
