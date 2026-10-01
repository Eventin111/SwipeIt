import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './RegisterPage.css';

const RegisterPage = () => {
  const submitRef = useRef(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitRef.current) return;
    submitRef.current = true;
    setMessage('');
    setError('');
    setIsLoading(true);

    try {
      await register(formData.email, formData.password, formData.username);
      setMessage('Регистрация успешна!');
      setTimeout(() => {
        navigate('/');
      }, 300);
    } catch (err) {
      setError(err.message || 'Не удалось зарегистрироваться');
    } finally {
      submitRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="auth-card">
        <div className="logo-section">
          <h1 className="logo">Swipelt</h1>
          <p className="subtitle">Создай аккаунт</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <input
              type="text"
              name="username"
              placeholder="Имя пользователя"
              value={formData.username}
              onChange={handleChange}
              required
              minLength="3"
              maxLength="50"
              disabled={isLoading}
              className="auth-input"
            />
          </div>

          <div className="input-group">
            <input
              type="email"
              name="email"
              placeholder="Почта"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={isLoading}
              className="auth-input"
            />
          </div>

          <div className="input-group">
            <input
              type="password"
              name="password"
              placeholder="Пароль (минимум 6 символов)"
              value={formData.password}
              onChange={handleChange}
              required
              minLength="6"
              disabled={isLoading}
              className="auth-input"
            />
          </div>

          <button type="submit" className="auth-button" disabled={isLoading}>
            {isLoading ? 'Создание...' : 'Создать аккаунт'}
          </button>
        </form>

        {message && <p className="success-message">{message}</p>}
        {error && <p role="alert" className="error-message">{error}</p>}

        <div className="auth-footer">
          <p>
            Уже есть аккаунт?{' '}
            <span 
              className="link" 
              onClick={() => !isLoading && navigate('/login')}
            >
              Войти
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
