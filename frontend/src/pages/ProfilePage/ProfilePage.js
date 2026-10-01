import { isValidEmail, isValidUsername } from '../../core/domain/services/authPolicy';
import { useDraft, useUnloadWarning } from '../../hooks/useDraft';
import { validateImage, IMAGE_ACCEPT } from '../../utils/validateImage';
import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { deleteFeedItem } from '../../core/application/usecases/deleteFeedItem';
import { deleteTryOnSession } from '../../core/application/usecases/deleteTryOnSession';
import { publishTryOnSession } from '../../core/application/usecases/publishTryOnSession';
import { uploadMedia } from '../../core/application/usecases/uploadMedia';
import { createApiFeedRepository } from '../../core/infrastructure/repositories/apiFeedRepository';
import { createApiMediaRepository } from '../../core/infrastructure/repositories/apiMediaRepository';
import { createApiProfileRepository } from '../../core/infrastructure/repositories/apiProfileRepository';
import { createApiTryOnRepository } from '../../core/infrastructure/repositories/apiTryOnRepository';
import { createApiUserRepository } from '../../core/infrastructure/repositories/apiUserRepository';
import feedIcon from '../../assets/icons/feed.png';
import searchIcon from '../../assets/icons/search.png';
import profileIcon from '../../assets/icons/profile.png';
import commentsIcon from '../../assets/icons/comments.png';
import wardrobeIcon from '../../assets/icons/wardrobe.png';
import './ProfilePage.css';

const feedRepository = createApiFeedRepository();
const mediaRepository = createApiMediaRepository();
const profileRepository = createApiProfileRepository();
const tryOnRepository = createApiTryOnRepository();
const userRepository = createApiUserRepository();

const persistTryOnPhotos = (photos) => {
  localStorage.setItem('tryOnPhotos', JSON.stringify(photos));
};

const persistPrimaryPhotoIndex = (index) => {
  localStorage.setItem('primaryPhotoIndex', String(index));
};

const normalizeProfilePhoto = (media) => ({
  id: media.id,
  mediaId: media.id,
  url: media.public_url,
  name: `Фото ${media.id}`,
  date: media.created_at ? new Date(media.created_at).toLocaleDateString() : new Date().toLocaleDateString()
});

const formatTryOnDate = (value) => {
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

const isTryOnMediaAsset = (media) => {
  const key = String(media?.storage_key || '').toLowerCase();
  return key.includes('/tryon/') || key.includes('\\tryon\\');
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const compressImage = async (file, { maxSize = 1600, quality = 0.85 } = {}) => {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  let image;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  } catch (error) {
    // Fallback to original file when browser cannot decode the format (for example HEIC/HEIF).
    return file;
  }

  const longestSide = Math.max(image.width, image.height);
  if (longestSide <= maxSize) {
    return file;
  }

  const scale = maxSize / longestSide;
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });

  if (!blob) {
    return file;
  }

  const nextName = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${nextName}.jpg`, { type: 'image/jpeg' });
};

const ProfilePage = ({ onCommentCreated = null }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAuthenticated, updateUserProfile } = useAuth();

  const isGuest = user?.isGuest;
  const isStandaloneProfileRoute = location.pathname === '/profile';
  const [activeView, setActiveView] = useState('profile');
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('appTheme') || 'dark');
  
  const [tryOnPhotos, setTryOnPhotos] = useState(() => {
    const savedPhotos = localStorage.getItem('tryOnPhotos');
    try {
      const photos = savedPhotos ? JSON.parse(savedPhotos) : [];
      return Array.isArray(photos) ? photos : [];
    } catch (error) { return []; }
  });
  const [primaryPhotoIndex, setPrimaryPhotoIndex] = useState(() => {
    const savedIndex = localStorage.getItem('primaryPhotoIndex');
    return savedIndex ? parseInt(savedIndex) : 0;
  });
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const [uploadError, setUploadError] = useState('');
  const photoUploadRef = useRef(false);
  const avatarUploadRef = useRef(false);
  const [failedPhotoFiles, setFailedPhotoFiles] = useState([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [isPhotosLoading, setIsPhotosLoading] = useState(false);
  const [profileStats, setProfileStats] = useState({
    tryons_count: 0,
    likes_count: 0,
    posts_count: 0,
    wardrobe_count: 0,
    followers_count: 0,
    following_count: 0
  });
  const [recentTryOns, setRecentTryOns] = useState([]);
  const [isProfileDataLoading, setIsProfileDataLoading] = useState(false);
  const [selectedTryOn, setSelectedTryOn] = useState(null);
  const [myPosts, setMyPosts] = useState([]);
  const [isTryOnPublishing, setIsTryOnPublishing] = useState(false);
  const [isTryOnDeleting, setIsTryOnDeleting] = useState(false);
  const [isPostDeletingId, setIsPostDeletingId] = useState(null);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishCaption, setPublishCaption] = useDraft(`publish:Caption:${user?.id}:${selectedTryOn?.session_id}`);
  const [publishHashtags, setPublishHashtags] = useDraft(`publish:Hashtags:${user?.id}:${selectedTryOn?.session_id}`);
  const [publishPhase, setPublishPhase] = useState('idle');
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    status: user?.status || ''
  });
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileSavePhase, setProfileSavePhase] = useState('idle');
  const [likesViewer, setLikesViewer] = useState({
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
  const [selectedPostPreview, setSelectedPostPreview] = useState(null);

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  const userStats = [
    { label: 'Постов', value: String(profileStats.posts_count || 0) },
    { label: 'Подписчики', value: String(profileStats.followers_count || 0) },
    { label: 'Подписки', value: String(profileStats.following_count || 0) },
    { label: 'Примерки', value: String(profileStats.tryons_count || 0) }
  ];

  const recentOutfits = recentTryOns
    .filter((item) => item?.result_image_url)
    .slice(0, 12)
    .map((item) => ({
      id: item.session_id,
      name: `Сессия #${item.session_id}`,
      image: item.result_image_url,
      raw: item
    }));

  const handleUpgradeToUser = () => {
    logout();
    setTimeout(() => {
      window.location.href = '/register';
    }, 100);
  };

  const handleLogin = () => {
    logout();
    setTimeout(() => {
      window.location.href = '/login';
    }, 100);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useUnloadWarning(isUploadingPhotos || failedPhotoFiles.length > 0 || isProfileSaving || Boolean(publishCaption || publishHashtags) ||
    (isEditProfileOpen && (profileForm.username !== user?.username || profileForm.email !== user?.email || profileForm.status !== (user?.status || ''))) || Boolean(commentText));

  const closeProfileEditor = () => {
    if (isProfileSaving) return;
    const changed = profileForm.username !== user?.username || profileForm.email !== user?.email || profileForm.status !== (user?.status || '');
    if (!changed || window.confirm('Закрыть форму и потерять несохранённые изменения профиля?')) setIsEditProfileOpen(false);
  };

  const handleEditProfileOpen = () => {
    setProfileForm({
      username: user?.username || '',
      email: user?.email || '',
      status: user?.status || ''
    });
    setProfileSavePhase('idle');
    setIsEditProfileOpen(true);
  };

  const handleEditProfileSubmit = async (event) => {
    event.preventDefault();
    if (isProfileSaving) return;
    if (!isValidUsername(profileForm.username) || !isValidEmail(profileForm.email)) {
      setUploadError('Введите корректный email и имя: 3–50 символов, буквы, цифры или подчёркивание.');
      return;
    }

    setIsProfileSaving(true);
    setProfileSavePhase('saving');
    setUploadError('');
    try {
      await updateUserProfile({
        username: profileForm.username.trim(),
        email: profileForm.email.trim(),
        status: String(profileForm.status || '').trim()
      });
      setProfileSavePhase('success');
      setTimeout(() => {
        setIsEditProfileOpen(false);
      }, 650);
    } catch (error) {
      setUploadError(error?.message || 'Не удалось сохранить профиль');
      setProfileSavePhase('error');
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleOpenLikesViewer = async (feedItemId, title = 'Лайки') => {
    if (!feedItemId) {
      return;
    }

    setLikesViewer({
      open: true,
      title,
      items: [],
      total: 0,
      loading: true,
      error: ''
    });
    try {
      const payload = await feedRepository.fetchFeedItemLikes(feedItemId, { limit: 200 });
      setLikesViewer({
        open: true,
        title,
        items: Array.isArray(payload?.items) ? payload.items : [],
        total: Number(payload?.total || 0),
        loading: false,
        error: ''
      });
    } catch (error) {
      setLikesViewer({
        open: true,
        title,
        items: [],
        total: 0,
        loading: false,
        error: error?.message || 'Не удалось загрузить список лайков'
      });
    }
  };

  const handleOpenCommentsViewer = async (feedItemId, title = 'Комментарии') => {
    if (commentSubmitRef.current) return;
    if (!feedItemId) {
      return;
    }

    const normalizedId = Number(feedItemId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      return;
    }

    setCommentsViewer({
      open: true,
      title,
      items: [],
      total: 0,
      loading: true,
      submitting: false,
      postId: normalizedId,
      text: '',
      error: ''
    });
    try {
      const payload = await feedRepository.fetchFeedItemComments(normalizedId, { limit: 200 });
      setCommentsViewer({
        open: true,
        title,
        items: Array.isArray(payload?.items) ? payload.items : [],
        total: Number(payload?.total || 0),
        loading: false,
        submitting: false,
        postId: normalizedId,
        text: '',
        error: ''
      });
    } catch (error) {
      setCommentsViewer({
        open: true,
        title,
        items: [],
        total: 0,
        loading: false,
        submitting: false,
        postId: normalizedId,
        text: '',
        error: error?.message || 'Не удалось загрузить комментарии'
      });
    }
  };

  const incrementPostCommentsCount = (feedItemId) => {
    const normalizedId = Number(feedItemId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      return;
    }
    setMyPosts((prev) => prev.map((post) => (
      Number(post.feed_item_id) === normalizedId
        ? { ...post, comments_count: Number(post.comments_count || 0) + 1 }
        : post
    )));
    setSelectedPostPreview((prev) => {
      if (!prev || Number(prev.feed_item_id) !== normalizedId) {
        return prev;
      }
      return { ...prev, comments_count: Number(prev.comments_count || 0) + 1 };
    });
  };

  const handleSubmitComment = async () => {
    if (commentSubmitRef.current) return;
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
      incrementPostCommentsCount(feedItemId);
      if (typeof onCommentCreated === 'function') {
        onCommentCreated(feedItemId, 1);
      }
    } catch (error) {
      setCommentsViewer((prev) => ({
        ...prev,
        submitting: false,
        error: error?.message || 'Не удалось отправить комментарий'
      }));
    } finally {
      commentSubmitRef.current = false;
    }
  };

  const reloadMyPosts = async (username) => {
    if (!username) {
      return;
    }
    const profilePayload = await userRepository.fetchPublicProfile(username, { limit: 60 });
    setMyPosts(Array.isArray(profilePayload?.posts) ? profilePayload.posts : []);
  };

  const handlePublishTryOnFromRecent = async () => {
    if (!selectedTryOn?.session_id || isTryOnPublishing) {
      return;
    }

    setIsTryOnPublishing(true);
    setPublishPhase('publishing');
    setUploadError('');
    try {
      const hashtags = publishHashtags
        .split(/[,\s]+/g)
        .map((item) => item.trim().replace(/^#/, ''))
        .filter(Boolean);
      await publishTryOnSession(tryOnRepository, selectedTryOn.session_id, {
        caption: publishCaption,
        hashtags
      });
      await reloadMyPosts(user?.username);
      const [statsPayload, recentPayload] = await Promise.all([
        profileRepository.fetchStats(),
        profileRepository.fetchRecentTryOns({ limit: 30 })
      ]);
      setProfileStats((prev) => ({
        ...prev,
        tryons_count: Number(statsPayload?.tryons_count || 0),
        likes_count: Number(statsPayload?.likes_count || 0),
        posts_count: Number(statsPayload?.posts_count || 0),
        wardrobe_count: Number(statsPayload?.wardrobe_count || 0),
        followers_count: Number(statsPayload?.followers_count || 0),
        following_count: Number(statsPayload?.following_count || 0)
      }));
      setRecentTryOns(Array.isArray(recentPayload) ? recentPayload : []);
      setPublishCaption('');
      setPublishHashtags('');
      setPublishPhase('success');
      setTimeout(() => {
        setSelectedTryOn(null);
        setIsPublishDialogOpen(false);
      }, 900);
    } catch (error) {
      setUploadError(error?.message || 'Не удалось опубликовать пост');
      setPublishPhase('error');
    } finally {
      setIsTryOnPublishing(false);
    }
  };

  const handleDeleteTryOnFromRecent = async () => {
    if (!selectedTryOn?.session_id || isTryOnDeleting) {
      return;
    }
    if (!window.confirm('Удалить эту примерку? Действие нельзя отменить.')) {
      return;
    }

    setIsTryOnDeleting(true);
    setUploadError('');
    try {
      await deleteTryOnSession(tryOnRepository, selectedTryOn.session_id);
      const [statsPayload, recentPayload] = await Promise.all([
        profileRepository.fetchStats(),
        profileRepository.fetchRecentTryOns({ limit: 30 })
      ]);
      setProfileStats((prev) => ({
        ...prev,
        tryons_count: Number(statsPayload?.tryons_count || 0),
        likes_count: Number(statsPayload?.likes_count || 0),
        posts_count: Number(statsPayload?.posts_count || 0),
        wardrobe_count: Number(statsPayload?.wardrobe_count || 0),
        followers_count: Number(statsPayload?.followers_count || 0),
        following_count: Number(statsPayload?.following_count || 0)
      }));
      setRecentTryOns(Array.isArray(recentPayload) ? recentPayload : []);
      setSelectedTryOn(null);
      setIsPublishDialogOpen(false);
    } catch (error) {
      setUploadError(error?.message || 'Не удалось удалить примерку');
    } finally {
      setIsTryOnDeleting(false);
    }
  };

  const handleDeletePost = async (feedItemId) => {
    if (!feedItemId || isPostDeletingId) {
      return;
    }
    if (!window.confirm('Удалить этот пост? Действие нельзя отменить.')) {
      return;
    }
    setIsPostDeletingId(feedItemId);
    setUploadError('');
    try {
      await deleteFeedItem(feedRepository, feedItemId);
      await reloadMyPosts(user?.username);
      const statsPayload = await profileRepository.fetchStats();
      setProfileStats((prev) => ({
        ...prev,
        posts_count: Number(statsPayload?.posts_count || 0),
        likes_count: Number(statsPayload?.likes_count || 0)
      }));
    } catch (error) {
      setUploadError(error?.message || 'Не удалось удалить пост');
    } finally {
      setIsPostDeletingId(null);
    }
  };

  const handlePhotoUpload = (e) => {
    if (photoUploadRef.current) return;
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    photoUploadRef.current = true;
    setIsUploadingPhotos(true);
    setFailedPhotoFiles([]);
    setUploadError('');
    void (async () => {
      try {
        if (files.length > 10) throw new Error('Выберите не больше 10 фотографий за один раз.');
        await Promise.all(files.map(validateImage));
        const preparedFiles = await Promise.all(
          files.map(async (file) => ({
            uploadFile: await compressImage(file)
          }))
        );

        const uploads = await Promise.allSettled(
          preparedFiles.map((item) => uploadMedia(mediaRepository, item.uploadFile))
        );
        const failed = uploads.filter((item) => item.status === 'rejected');
        setFailedPhotoFiles(files.filter((file, index) => uploads[index].status === 'rejected'));
        if (failed.length) {
          setUploadError(`Не удалось загрузить ${failed.length} из ${files.length} фото. ${failed[0].reason?.message || ''}`);
        }

        const canonicalPhotos = (await mediaRepository.fetchMyMedia())
          .filter((item) => !isTryOnMediaAsset(item))
          .map(normalizeProfilePhoto);
        setTryOnPhotos(canonicalPhotos);
        persistTryOnPhotos(canonicalPhotos);

        const savedIndex = Number(localStorage.getItem('primaryPhotoIndex') || 0);
        const safeIndex =
          Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < canonicalPhotos.length ? savedIndex : 0;
        setPrimaryPhotoIndex(safeIndex);
        persistPrimaryPhotoIndex(safeIndex);
      } catch (error) {
        setUploadError(error?.message || 'Не удалось загрузить фото');
      } finally {
        photoUploadRef.current = false;
        setIsUploadingPhotos(false);
      }
    })();
    e.target.value = '';
  };

  const handleDeletePhoto = (index, e) => {
    e.stopPropagation();
    if (!window.confirm('Удалить фотографию? Действие нельзя отменить.')) return;
    setUploadError('');
    void (async () => {
      try {
        const photo = tryOnPhotos[index];
        if (photo?.mediaId) {
          await mediaRepository.deleteMedia(photo.mediaId);
        }

        const updatedPhotos = tryOnPhotos.filter((_, i) => i !== index);
        setTryOnPhotos(updatedPhotos);
        persistTryOnPhotos(updatedPhotos);

        if (primaryPhotoIndex >= updatedPhotos.length) {
          const newIndex = updatedPhotos.length > 0 ? updatedPhotos.length - 1 : 0;
          setPrimaryPhotoIndex(newIndex);
          persistPrimaryPhotoIndex(newIndex);
        } else if (index < primaryPhotoIndex) {
          const nextIndex = primaryPhotoIndex - 1;
          setPrimaryPhotoIndex(nextIndex);
          persistPrimaryPhotoIndex(nextIndex);
        }
      } catch (error) {
        setUploadError(error?.message || 'Не удалось удалить фото');
      }
    })();
  };

  const handleSetPrimary = (index, e) => {
    if (e) e.stopPropagation();
    setPrimaryPhotoIndex(index);
    persistPrimaryPhotoIndex(index);
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const triggerAvatarInput = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarUpload = (e) => {
    if (avatarUploadRef.current) return;
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    avatarUploadRef.current = true;
    setUploadError('');
    void (async () => {
      try {
        await validateImage(file);
        const uploadFile = await compressImage(file, { maxSize: 1200, quality: 0.82 });
        const payload = await uploadMedia(mediaRepository, uploadFile);
        const avatarUrl = payload.upload_url || payload.media.public_url;
        if (!avatarUrl) {
          throw new Error('Сервер не вернул ссылку на аватар');
        }
        await updateUserProfile({ avatar: avatarUrl });
      } catch (error) {
        setUploadError(error?.message || 'Не удалось обновить аватар');
      } finally {
        avatarUploadRef.current = false;
      }
    })();
    e.target.value = '';
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('appTheme') || 'dark';
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(`theme-${savedTheme}`);
    localStorage.setItem('appTheme', savedTheme);
    setThemeMode(savedTheme);
  }, []);

  useEffect(() => {
    setProfileForm({
      username: user?.username || '',
      email: user?.email || '',
      status: user?.status || ''
    });
  }, [user?.username, user?.email, user?.status]);

  useEffect(() => {
    if (!isAuthenticated || isGuest) {
      return;
    }

    let cancelled = false;
    const syncProfilePhotos = async () => {
      setIsPhotosLoading(true);
      try {
        const mediaItems = await mediaRepository.fetchMyMedia();
        if (cancelled) {
          return;
        }

        const serverPhotos = mediaItems
          .filter((item) => !isTryOnMediaAsset(item))
          .map(normalizeProfilePhoto);
        setTryOnPhotos(serverPhotos);
        persistTryOnPhotos(serverPhotos);

        const savedIndex = Number(localStorage.getItem('primaryPhotoIndex') || 0);
        const safeIndex =
          Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < serverPhotos.length ? savedIndex : 0;
        setPrimaryPhotoIndex(safeIndex);
        persistPrimaryPhotoIndex(safeIndex);
      } catch (error) {
        if (!cancelled) {
          setUploadError(error?.message || 'Не удалось загрузить сохранённые фото');
        }
      } finally {
        if (!cancelled) {
          setIsPhotosLoading(false);
        }
      }
    };

    void syncProfilePhotos();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isGuest, user?.username]);

  useEffect(() => {
    if (!isAuthenticated || isGuest) {
      return;
    }

    let cancelled = false;
    const loadProfileData = async () => {
      setIsProfileDataLoading(true);
      try {
        const [statsPayload, recentPayload, publicProfilePayload] = await Promise.all([
          profileRepository.fetchStats(),
          profileRepository.fetchRecentTryOns({ limit: 30 }),
          user?.username ? userRepository.fetchPublicProfile(user.username, { limit: 60 }) : Promise.resolve({ posts: [] })
        ]);
        if (cancelled) {
          return;
        }
        setProfileStats({
          tryons_count: Number(statsPayload?.tryons_count || 0),
          likes_count: Number(statsPayload?.likes_count || 0),
          posts_count: Number(statsPayload?.posts_count || 0),
          wardrobe_count: Number(statsPayload?.wardrobe_count || 0),
          followers_count: Number(statsPayload?.followers_count || 0),
          following_count: Number(statsPayload?.following_count || 0)
        });
        setRecentTryOns(Array.isArray(recentPayload) ? recentPayload : []);
        setMyPosts(Array.isArray(publicProfilePayload?.posts) ? publicProfilePayload.posts : []);
      } catch (error) {
        if (!cancelled) {
          setUploadError(error?.message || 'Не удалось загрузить статистику профиля');
        }
      } finally {
        if (!cancelled) {
          setIsProfileDataLoading(false);
        }
      }
    };

    void loadProfileData();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isGuest]);

  const handleThemeChange = (nextTheme) => {
    if (!nextTheme || nextTheme === themeMode) {
      return;
    }

    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(`theme-${nextTheme}`);
    localStorage.setItem('appTheme', nextTheme);
    setThemeMode(nextTheme);

    const settingsRaw = localStorage.getItem('appSettings');
    if (settingsRaw) {
      try {
        const parsed = JSON.parse(settingsRaw);
        localStorage.setItem('appSettings', JSON.stringify({ ...parsed, theme: nextTheme }));
      } catch (error) {
        localStorage.setItem('appSettings', JSON.stringify({ theme: nextTheme, showInstructions: true }));
      }
    }
  };

  const openTab = (tab) => {
    if (tab === 'chat' && isGuest) {
      setUploadError('В гостевом режиме сообщения недоступны. Войдите или зарегистрируйтесь.');
      return;
    }
    navigate('/', { state: { openTab: tab } });
  };

  if (activeView === 'wardrobe') {
    return (
      <div className="profile-container">
        <header className="profile-header">
          <button className="back-btn" onClick={() => setActiveView('profile')}>
            ← Назад
          </button>
          <h1 className="profile-title">Мои примерки</h1>
          <div style={{ width: '70px' }}></div>
        </header>

        <div className="profile-scroll-container">
          <section className="outfits-section">
            <div className="section-header">
              <button className="view-all-btn" onClick={() => setActiveView('profile')}>
                ← Назад в профиль
              </button>
            </div>
            <h3 className="section-title">Сохраненные примерки</h3>
            {recentOutfits.length === 0 ? (
              <div className="empty-photos">Пока нет сохраненных примерок</div>
            ) : (
              <div className="outfits-grid outfits-grid--saved">
                {recentOutfits.map((outfit) => (
                  <button
                    key={outfit.id}
                    type="button"
                    className="outfit-card outfit-card--saved"
                    onClick={() => setSelectedTryOn(outfit.raw)}
                  >
                    <img src={outfit.image} alt={outfit.name} />
                    <div className="outfit-overlay outfit-overlay--always">
                      <span className="outfit-name">{outfit.name}</span>
                      {outfit.raw?.published_post_id ? (
                        <span className="try-again-btn">Пост #{outfit.raw.published_post_id}</span>
                      ) : (
                        <span className="try-again-btn">Не опубликовано</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      {/* Шапка профиля БЕЗ кнопки "Назад" */}
      <header className="profile-header">
        {isStandaloneProfileRoute ? (
          <button className="back-btn" onClick={() => navigate('/')}>
            ← Лента
          </button>
        ) : (
          <div style={{ width: '20px' }}></div>
        )}
        <h1 className="profile-title">Профиль</h1>
        {!isGuest ? (
          <button className="logout-btn" onClick={handleLogout}>
            Выйти
          </button>
        ) : (
          <div style={{ width: '20px' }}></div>
        )}
      </header>

      <div className="profile-scroll-container">
        
        {isGuest ? (
          <div className="guest-banner">
            <div className="guest-banner-content">
              <span className="guest-badge">👤 Гость</span>
              <h3>Вы используете гостевой режим</h3>
              <p>Войдите или зарегистрируйтесь, чтобы сохранить историю примерок и получить больше возможностей</p>
              <div className="guest-banner-buttons">
                <button className="guest-action-btn primary" onClick={handleLogin}>
                  Войти
                </button>
                <button className="guest-action-btn secondary" onClick={handleUpgradeToUser}>
                  Зарегистрироваться
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {uploadError && <div role="alert" className="tryon-alert tryon-alert--error">{uploadError}</div>}
            {isUploadingPhotos && <p role="status">Загружаем фотографии…</p>}
            {failedPhotoFiles.length > 0 && <button disabled={isUploadingPhotos} onClick={() => handlePhotoUpload({ target: { files: failedPhotoFiles, value: '' } })}>Повторить загрузку неотправленных фото ({failedPhotoFiles.length})</button>}
            <div className="profile-info">
              <div className="avatar-section">
                <img 
                  src={user?.avatar || 'https://ui-avatars.com/api/?name=User&background=ff0000&color=fff'} 
                  alt="Аватар" 
                  className="profile-avatar"
                />
                <button className="edit-avatar-btn" onClick={triggerAvatarInput} title="Сменить аватар">
                  ✎
                </button>
                <input
                  type="file"
                  ref={avatarInputRef}
                  onChange={handleAvatarUpload}
                  accept={IMAGE_ACCEPT}
                  style={{ display: 'none' }}
                />
              </div>
              
              <div className="user-details">
                <h2 className="username">{user?.username || 'Пользователь'}</h2>
                <p className="user-email">{user?.email || 'email@example.com'}</p>
                <p className="user-status">{String(user?.status || '').trim() || 'Статус не указан'}</p>
                <button className="edit-profile-btn" onClick={handleEditProfileOpen}>
                  Редактировать профиль
                </button>
              </div>
            </div>

            <div className="stats-section">
              <h3 className="section-title">Статистика</h3>
              {isProfileDataLoading ? (
                <div className="empty-photos">Загружаем статистику...</div>
              ) : (
                <div className="profile-stats-inline">
                  {userStats.map((stat, index) => (
                    <div key={index} className="profile-stats-inline__item">
                      <strong>{stat.value}</strong>
                      <span>{stat.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="photos-section">
              <div className="section-header">
                <h3 className="section-title">Фото для примерок</h3>
                <button className="add-photo-btn" onClick={triggerFileInput}>
                  + Добавить фото
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  accept={IMAGE_ACCEPT}
                  multiple
                  style={{ display: 'none' }}
                />
              </div>
              
              {isPhotosLoading ? (
                <div className="empty-photos">
                  <div className="empty-photos-icon">⏳</div>
                  <h4>Загружаем фото</h4>
                  <p>Подтягиваем сохранённые фотографии с сервера</p>
                </div>
              ) : tryOnPhotos.length === 0 ? (
                <div className="empty-photos">
                  <div className="empty-photos-icon">📷</div>
                  <h4>Нет загруженных фото</h4>
                  <p>Загрузите фото, чтобы использовать их для виртуальных примерок</p>
                  <button className="upload-btn" onClick={triggerFileInput}>
                    Загрузить первое фото
                  </button>
                </div>
              ) : (
                <>
                  <div className="photos-grid">
                    {tryOnPhotos.map((photo, index) => (
                      <div 
                        key={photo.id} 
                        className={`photo-item ${index === primaryPhotoIndex ? 'primary' : ''}`}
                      >
                        <img src={photo.url} alt={`Фото ${index + 1}`} />
                        <div className="photo-overlay">
                          {index === primaryPhotoIndex && (
                            <div className="primary-badge">★ Основное</div>
                          )}
                          <div className="photo-actions">
                            <button 
                              className="photo-action-btn delete-btn"
                              onClick={(e) => handleDeletePhoto(index, e)}
                              title="Удалить фото"
                            >
                              🗑️
                            </button>
                            {index !== primaryPhotoIndex && (
                              <button 
                                className="photo-action-btn set-primary-btn"
                                onClick={(e) => handleSetPrimary(index, e)}
                                title="Сделать основным"
                              >
                                ⭐
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="photo-info">
                          <span className="photo-name">Фото {index + 1}</span>
                          <span className="photo-date">{photo.date}</span>
                        </div>
                      </div>
                    ))}
                    
                    <div className="photo-item add-photo-item" onClick={triggerFileInput}>
                      <div className="add-photo-content">
                        <span className="add-icon">+</span>
                        <span className="add-text">Добавить фото</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="photos-info">
                    <p className="photos-hint">
                      <span className="hint-icon">💡</span>
                      <span>Нажмите на кнопку ⭐ чтобы сделать фото основным для примерок</span>
                    </p>
                    <p className="photos-count">
                      Загружено фото: {tryOnPhotos.length} | Основное: {primaryPhotoIndex + 1}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="outfits-section">
              <div className="section-header">
                <h3 className="section-title">Сохраненные примерки</h3>
                <button className="view-all-btn" onClick={() => setActiveView('wardrobe')}>
                  Все примерки →
                </button>
              </div>

              {recentOutfits.length === 0 ? (
                <div className="empty-photos">У вас пока нет завершенных примерок с результатом</div>
              ) : (
                <div className="outfits-grid outfits-grid--saved">
                  {recentOutfits.map((outfit) => (
                    <button
                      key={outfit.id}
                      type="button"
                      className="outfit-card outfit-card--saved"
                      onClick={() => setSelectedTryOn(outfit.raw)}
                    >
                      <img src={outfit.image} alt={outfit.name} />
                      <div className="outfit-overlay outfit-overlay--always">
                        <span className="outfit-name">{outfit.name}</span>
                        {outfit.raw?.published_post_id ? (
                          <span className="try-again-btn">Пост #{outfit.raw.published_post_id}</span>
                        ) : (
                          <span className="try-again-btn">Открыть детали</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="outfits-section">
              <div className="section-header">
                <h3 className="section-title">Мои посты</h3>
              </div>
              {myPosts.length === 0 ? (
                <div className="empty-photos">Пока нет опубликованных образов</div>
              ) : (
                <div className="profile-posts-feed">
                  {myPosts.map((post) => (
                    <article key={post.feed_item_id} className="profile-post-card">
                      <button
                        type="button"
                        className="profile-post-card__image-btn"
                        onClick={() => setSelectedPostPreview(post)}
                      >
                        <img
                          className="profile-post-card__image"
                          src={post.image_url || 'https://via.placeholder.com/700x1000?text=No+Image'}
                          alt={post.caption || 'Пост'}
                        />
                      </button>
                      <div className="profile-post-card__body">
                        <p className="profile-post-card__caption">
                          {stripMusicLine(post.caption) || `Пост #${post.feed_item_id}`}
                        </p>
                        <p className="profile-post-card__date">
                          {formatTryOnDate(post.created_at) || 'Дата публикации неизвестна'}
                        </p>
                        <div className="profile-post-card__meta">
                          <button
                            type="button"
                            className="profile-post-chip profile-post-chip--button"
                            onClick={() => handleOpenLikesViewer(post.feed_item_id, `Лайки поста #${post.feed_item_id}`)}
                          >
                            {post.likes_count} лайков
                          </button>
                          <button
                            type="button"
                            className="profile-post-chip profile-post-chip--button"
                            onClick={() => handleOpenCommentsViewer(post.feed_item_id, `Комментарии поста #${post.feed_item_id}`)}
                          >
                            {post.comments_count || 0} комментариев
                          </button>
                          {post.source_post_id ? (
                            <span className="profile-post-chip profile-post-chip--muted">Источник: пост #{post.source_post_id}</span>
                          ) : (
                            <span className="profile-post-chip profile-post-chip--muted">Пост из вашей примерки</span>
                          )}
                        </div>
                        <div className="profile-post-card__actions">
                          <button
                            type="button"
                            className="try-again-btn try-again-btn--danger"
                            onClick={() => handleDeletePost(post.feed_item_id)}
                            disabled={isPostDeletingId === post.feed_item_id}
                          >
                            {isPostDeletingId === post.feed_item_id ? 'Удаляем...' : 'Удалить'}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="settings-section">
          <h3 className="section-title">Настройки</h3>
          <div className="settings-list">
            {!isGuest && (
              <>
                <button className="setting-item" onClick={() => setIsAppearanceOpen((prev) => !prev)}>
                  <span>👁️</span>
                  <span>Вид</span>
                  <span>{isAppearanceOpen ? '↓' : '→'}</span>
                </button>
                <button className="setting-item">
                  <span>🔔</span>
                  <span>Уведомления</span>
                  <span>→</span>
                </button>
                <button className="setting-item">
                  <span>🔒</span>
                  <span>Конфиденциальность</span>
                  <span>→</span>
                </button>
              </>
            )}
            
            <button className="setting-item logout-item" onClick={isGuest ? logout : handleLogout}>
              <span>🚪</span>
              <span>{isGuest ? 'Выйти из гостевого режима' : 'Выйти из аккаунта'}</span>
              <span>→</span>
            </button>
          </div>

          {!isGuest && isAppearanceOpen && (
            <div className="appearance-panel">
              <p className="appearance-title">Тема приложения</p>
              <div className="appearance-options">
                <button
                  className={`appearance-option ${themeMode === 'dark' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('dark')}
                >
                  <span>🌙</span>
                  <span>Темная</span>
                </button>
                <button
                  className={`appearance-option ${themeMode === 'light' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('light')}
                >
                  <span>☀️</span>
                  <span>Светлая</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {isEditProfileOpen && (
          <div className="profile-modal-backdrop" onClick={closeProfileEditor}>
            <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
              <h3>Редактировать профиль</h3>
              <form onSubmit={handleEditProfileSubmit}>
                <label className="profile-modal-label">
                  Username
                  <input
                    className="profile-modal-input"
                    value={profileForm.username}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, username: event.target.value }))}
                    required
                  />
                </label>
                <label className="profile-modal-label">
                  Email
                  <input
                    className="profile-modal-input"
                    type="email"
                    value={profileForm.email}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                    required
                  />
                </label>
                <label className="profile-modal-label">
                  Статус
                  <input
                    className="profile-modal-input"
                    value={profileForm.status}
                    maxLength={160}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, status: event.target.value }))}
                    placeholder="Например: Люблю streetwear и techwear"
                  />
                </label>
                <div className={`profile-save-status ${profileSavePhase}`}>
                  {profileSavePhase === 'idle' && 'Изменения еще не сохранены'}
                  {profileSavePhase === 'saving' && 'Сохраняем профиль...'}
                  {profileSavePhase === 'success' && 'Готово, профиль обновлен'}
                  {profileSavePhase === 'error' && 'Ошибка сохранения'}
                </div>
                <div className="profile-modal-actions">
                  <button type="button" className="profile-modal-cancel" onClick={closeProfileEditor}>
                    Отмена
                  </button>
                  <button type="submit" className="edit-profile-btn" disabled={isProfileSaving}>
                    {isProfileSaving ? 'Сохраняем...' : 'Сохранить'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {selectedTryOn && (
          <div className="profile-modal-backdrop" onClick={() => { setSelectedTryOn(null); setIsPublishDialogOpen(false); }}>
            <div className="profile-modal profile-modal--wide" onClick={(event) => event.stopPropagation()}>
              <h3>Детали примерки #{selectedTryOn.session_id}</h3>
              <p className="profile-modal-date">{formatTryOnDate(selectedTryOn.created_at)}</p>
              <div className="tryon-detail-grid">
                <div className="tryon-detail-card">
                  <p>Фото модели</p>
                  {selectedTryOn.avatar_image_url ? (
                    <img src={selectedTryOn.avatar_image_url} alt="Фото модели" />
                  ) : (
                    <div className="empty-photos">Нет фото</div>
                  )}
                </div>
                <div className="tryon-detail-card">
                  <p>Фото одежды</p>
                  {selectedTryOn.cloth_image_url ? (
                    <img src={selectedTryOn.cloth_image_url} alt="Фото одежды" />
                  ) : (
                    <div className="empty-photos">Нет фото</div>
                  )}
                </div>
                <div className="tryon-detail-card">
                  <p>Результат</p>
                  {selectedTryOn.result_image_url ? (
                    <img src={selectedTryOn.result_image_url} alt="Результат" />
                  ) : (
                    <div className="empty-photos">Нет результата</div>
                  )}
                </div>
              </div>
              <div className="profile-modal-actions">
                <button
                  type="button"
                  className="profile-modal-cancel"
                  onClick={() => {
                    setIsPublishDialogOpen(false);
                    setSelectedTryOn(null);
                  }}
                >
                  Назад
                </button>
                <button
                  type="button"
                  className="profile-modal-cancel"
                  onClick={handleDeleteTryOnFromRecent}
                  disabled={isTryOnDeleting || isTryOnPublishing}
                >
                  {isTryOnDeleting ? 'Удаляем...' : 'Удалить'}
                </button>
                <button
                  type="button"
                  className="edit-profile-btn"
                  onClick={() => setIsPublishDialogOpen(true)}
                  disabled={isTryOnPublishing || isTryOnDeleting}
                >
                  Сделать пост
                </button>
              </div>
            </div>
          </div>
        )}

        {isPublishDialogOpen && selectedTryOn && (
          <div className="profile-modal-backdrop" onClick={() => setIsPublishDialogOpen(false)}>
            <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
              <h3>Публикация образа</h3>
              <p className="profile-modal-date">Добавьте подпись к посту</p>
              <textarea
                className="profile-modal-input"
                rows={4}
                maxLength={2000}
                value={publishCaption}
                onChange={(event) => setPublishCaption(event.target.value)}
                placeholder="Например: мой новый лук"
              />
              <input
                className="profile-modal-input"
                value={publishHashtags}
                onChange={(event) => setPublishHashtags(event.target.value)}
                placeholder="Хэштеги: #style #outfit"
              />
              <div className={`publish-status-chip ${publishPhase}`}>
                {publishPhase === 'publishing' && 'Публикуем пост...'}
                {publishPhase === 'success' && 'Готово. Пост опубликован'}
                {publishPhase === 'error' && 'Ошибка публикации'}
                {publishPhase === 'idle' && 'Заполните поля и нажмите "Опубликовать"'}
              </div>
              <div className={`publish-progress ${publishPhase === 'publishing' ? 'is-running' : ''} ${publishPhase === 'success' ? 'is-success' : ''}`}>
                <div className="publish-progress__bar" />
              </div>
              <div className="profile-modal-actions">
                <button type="button" className="profile-modal-cancel" onClick={() => setIsPublishDialogOpen(false)}>
                  Отмена
                </button>
                <button type="button" className="edit-profile-btn" onClick={handlePublishTryOnFromRecent} disabled={isTryOnPublishing}>
                  {isTryOnPublishing ? 'Публикуем...' : 'Опубликовать'}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedPostPreview && (
          <div className="profile-modal-backdrop" onClick={() => setSelectedPostPreview(null)}>
            <div className="profile-modal profile-modal--wide profile-post-preview" onClick={(event) => event.stopPropagation()}>
              <h3>Пост #{selectedPostPreview.feed_item_id}</h3>
              <img
                className="profile-post-preview__image"
                src={selectedPostPreview.image_url || 'https://via.placeholder.com/700x1000?text=No+Image'}
                alt={selectedPostPreview.caption || 'Пост'}
              />
              <p className="profile-post-card__caption">
                {stripMusicLine(selectedPostPreview.caption) || 'Без подписи'}
              </p>
              <p className="profile-post-card__date">
                {formatTryOnDate(selectedPostPreview.created_at) || 'Дата публикации неизвестна'}
              </p>
              <div className="profile-modal-actions">
                <button
                  type="button"
                  className="profile-modal-cancel"
                  onClick={() => {
                    void handleOpenCommentsViewer(
                      selectedPostPreview.feed_item_id,
                      `Комментарии поста #${selectedPostPreview.feed_item_id}`
                    );
                  }}
                >
                  Комментарии ({selectedPostPreview.comments_count || 0})
                </button>
                <button type="button" className="edit-profile-btn" onClick={() => setSelectedPostPreview(null)}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}

        {commentsViewer.open && (
          <div className="profile-modal-backdrop" onClick={() => setCommentsViewer((prev) => ({ ...prev, open: false, text: '', error: '' }))}>
            <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
              <h3>{commentsViewer.title || 'Комментарии'}</h3>
              {commentsViewer.loading && <div className="empty-photos">Загружаем комментарии...</div>}
              {!commentsViewer.loading && commentsViewer.error && (
                <div className="tryon-alert tryon-alert--error">{commentsViewer.error}</div>
              )}
              {!commentsViewer.loading && !commentsViewer.error && commentsViewer.items.length === 0 && (
                <div className="empty-photos">Пока нет комментариев</div>
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
                  className="profile-modal-cancel"
                  onClick={() => setCommentsViewer((prev) => ({ ...prev, open: false, text: '', error: '' }))}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}

        {likesViewer.open && (
          <div className="profile-modal-backdrop" onClick={() => setLikesViewer((prev) => ({ ...prev, open: false }))}>
            <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
              <h3>{likesViewer.title || 'Лайки'}</h3>
              {likesViewer.loading && <div className="empty-photos">Загружаем список...</div>}
              {!likesViewer.loading && likesViewer.error && (
                <div className="tryon-alert tryon-alert--error">{likesViewer.error}</div>
              )}
              {!likesViewer.loading && !likesViewer.error && likesViewer.items.length === 0 && (
                <div className="empty-photos">Пока никто не лайкнул этот пост</div>
              )}
              {!likesViewer.loading && !likesViewer.error && likesViewer.items.length > 0 && (
                <div className="likes-list">
                  {likesViewer.items.map((likeUser) => (
                    <button
                      key={`${likeUser.user_id}-${likeUser.liked_at}`}
                      type="button"
                      className="likes-user-item"
                      onClick={() => navigate(`/u/${encodeURIComponent(likeUser.username)}`)}
                    >
                      <img
                        src={likeUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(likeUser.username)}&background=ff0000&color=fff`}
                        alt={likeUser.username}
                      />
                      <div className="likes-user-meta">
                        <strong>@{likeUser.username}</strong>
                        <span>{formatTryOnDate(likeUser.liked_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="profile-modal-actions">
                <button
                  type="button"
                  className="profile-modal-cancel"
                  onClick={() => setLikesViewer((prev) => ({ ...prev, open: false }))}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isStandaloneProfileRoute && (
        <nav className="public-profile__bottom-nav">
          <button className="public-profile__nav-btn" onClick={() => openTab('feed')}>
            <img src={feedIcon} alt="" />
            <span>Лента</span>
          </button>
          <button className="public-profile__nav-btn" onClick={() => openTab('search')}>
            <img src={searchIcon} alt="" />
            <span>Поиск</span>
          </button>
          <button className="public-profile__nav-btn" onClick={() => navigate('/try-on')}>
            <img src={wardrobeIcon} alt="" />
            <span>Примерка</span>
          </button>
          <button className="public-profile__nav-btn" onClick={() => openTab('chat')}>
            <img src={commentsIcon} alt="" />
            <span>Чаты</span>
          </button>
          <button className="public-profile__nav-btn is-active" onClick={() => openTab('profile')}>
            <img src={profileIcon} alt="" />
            <span>Профиль</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default ProfilePage;
