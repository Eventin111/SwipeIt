import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createApiWardrobeRepository } from '../../core/infrastructure/repositories/apiWardrobeRepository';
import { useAuth } from '../../hooks/useAuth';
import './WardrobePage.css';

const wardrobeRepository = createApiWardrobeRepository();

const normalizeCategory = (value) => {
  const key = String(value || '').trim().toLowerCase();
  if (!key) {
    return 'other';
  }

  if (key.includes('sport')) {
    return 'sport';
  }
  if (key.includes('casual')) {
    return 'casual';
  }
  if (key.includes('formal')) {
    return 'formal';
  }
  if (key.includes('evening')) {
    return 'evening';
  }
  if (key.includes('outer')) {
    return 'outerwear';
  }

  return key;
};

const categoryNames = {
  all: 'Все',
  formal: 'Деловая',
  casual: 'Повседневная',
  sport: 'Спортивная',
  evening: 'Вечерняя',
  outerwear: 'Верхняя одежда',
  other: 'Другое'
};

const formatDate = (value) => {
  if (!value) {
    return 'Недавно';
  }
  try {
    return new Date(value).toLocaleDateString();
  } catch (error) {
    return 'Недавно';
  }
};

const WardrobePage = ({ isEmbedded = false, onBack }) => {
  const navigate = useNavigate();
  const { user, clearAuth } = useAuth();
  const [activeCategory, setActiveCategory] = useState('all');
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.isGuest) {
      setItems([]);
      setIsLoading(false);
      setError('');
      return;
    }

    let cancelled = false;

    const loadWardrobe = async () => {
      setIsLoading(true);
      setError('');
      try {
        const payload = await wardrobeRepository.fetchWardrobeItems({ skip: 0, limit: 200 });
        if (cancelled) {
          return;
        }
        setItems(payload);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Не удалось загрузить гардероб');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadWardrobe();
    return () => {
      cancelled = true;
    };
  }, [user?.isGuest]);

  const categories = useMemo(() => {
    const counts = items.reduce((acc, item) => {
      const key = normalizeCategory(item?.garment?.category);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const dynamic = Object.keys(counts).map((key) => ({
      id: key,
      name: categoryNames[key] || key,
      count: counts[key]
    }));

    dynamic.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return [{ id: 'all', name: 'Все', count: items.length }, ...dynamic];
  }, [items]);

  const filteredItems = useMemo(() => {
    if (activeCategory === 'all') {
      return items;
    }

    return items.filter((item) => normalizeCategory(item?.garment?.category) === activeCategory);
  }, [activeCategory, items]);

  const handleRemove = async (garmentId) => {
    if (!window.confirm('Удалить вещь из гардероба?')) return;
    try {
      await wardrobeRepository.removeByGarmentId(garmentId);
      setItems((prev) => prev.filter((item) => item.garment_id !== garmentId));
    } catch (removeError) {
      setError(removeError?.message || 'Не удалось удалить вещь из гардероба');
    }
  };

  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    navigate('/');
  };

  const exitGuestAndNavigate = (path) => {
    clearAuth();
    navigate(path);
  };

  if (user?.isGuest) {
    return (
      <div className={`wardrobe-container ${isEmbedded ? 'embedded' : ''}`}>
        <header className="wardrobe-header">
          <button className="back-btn" onClick={handleBack}>
            ← Назад
          </button>
          <h1 className="wardrobe-title">Мой гардероб</h1>
          <div style={{ width: '40px' }} />
        </header>
        <div className="wardrobe-content">
          <div className="wardrobe-guest-lock">
            <h3>Гардероб недоступен в гостевом режиме</h3>
            <p>Войдите или зарегистрируйтесь, чтобы сохранять вещи и управлять гардеробом.</p>
            <div className="wardrobe-guest-actions">
              <button className="back-btn" onClick={() => exitGuestAndNavigate('/login')}>
                Войти
              </button>
              <button className="back-btn wardrobe-guest-primary" onClick={() => exitGuestAndNavigate('/register')}>
                Зарегистрироваться
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`wardrobe-container ${isEmbedded ? 'embedded' : ''}`}>
      <header className="wardrobe-header">
        <button className="back-btn" onClick={handleBack}>
          ← Назад
        </button>
        <h1 className="wardrobe-title">Мой гардероб</h1>
        <div style={{ width: '40px' }} />
      </header>

      <div className="wardrobe-content">
        {error && <div className="tryon-alert tryon-alert--error">{error}</div>}

        <div className="categories-section">
          <div className="categories-scroll">
            {categories.map((category) => (
              <button
                key={category.id}
                className={`category-btn ${activeCategory === category.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(category.id)}
              >
                <span className="category-name">{category.name}</span>
                <span className="category-count">{category.count}</span>
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="empty-wardrobe">Загружаем гардероб...</div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-wardrobe">В гардеробе пока нет сохраненных вещей</div>
        ) : (
          <div className="wardrobe-grid">
            {filteredItems.map((item) => (
              <div key={item.id} className="wardrobe-item">
                <img
                  src={item.garment.image_url || 'https://via.placeholder.com/300x400?text=No+Image'}
                  alt={item.garment.title}
                  className="item-image"
                />
                <div className="item-info">
                  <h4 className="item-name">{item.garment.title}</h4>
                  <div className="item-details">
                    <span className="item-brand">{item.garment.brand || 'Без бренда'}</span>
                    {item.garment.category ? <span className="item-color">{item.garment.category}</span> : null}
                  </div>
                  <div className="item-footer">
                    <span className="item-last-worn">Добавлено: {formatDate(item.created_at)}</span>
                  </div>
                  <button className="wardrobe-remove-btn" onClick={() => handleRemove(item.garment_id)}>
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WardrobePage;
