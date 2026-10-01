import HintedInput from '../../components/HintedInput/HintedInput';
import { INPUT_RULES, inputError, capitalizeName } from '../../core/domain/services/authPolicy';
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
  const [touched, setTouched] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.name === 'username' ? capitalizeName(e.target.value) : e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ username: true, email: true, password: true });
    const validationError = ['username', 'email', 'password'].map((field) => inputError(field, formData[field])).find(Boolean);
    if (validationError) { setError(validationError); return; }
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

        <form noValidate onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <HintedInput
              type="text"
              name="username"
              hint={INPUT_RULES.username}
              onBlur={() => setTouched((prev) => ({ ...prev, username: true }))}
              aria-invalid={Boolean(touched.username && inputError('username', formData.username))}
              aria-describedby="username-error"
              placeholder="Имя пользователя"
              value={formData.username}
              onChange={handleChange}
              required
              minLength="3"
              maxLength="50"
              disabled={isLoading}
              className="auth-input"
            />
            {touched.username && inputError('username', formData.username) && <small id="username-error" role="alert" className="error-message">{inputError('username', formData.username)}</small>}
          </div>

          <div className="input-group">
            <HintedInput
              type="email"
              name="email"
              hint={INPUT_RULES.email}
              onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
              aria-invalid={Boolean(touched.email && inputError('email', formData.email))}
              aria-describedby="email-error"
              placeholder="Почта"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={isLoading}
              className="auth-input"
            />
            {touched.email && inputError('email', formData.email) && <small id="email-error" role="alert" className="error-message">{inputError('email', formData.email)}</small>}
          </div>

          <div className="input-group">
            <HintedInput
              type="password"
              name="password"
              hint={INPUT_RULES.password}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              aria-invalid={Boolean(touched.password && inputError('password', formData.password))}
              aria-describedby="password-error"
              placeholder="Пароль (минимум 6 символов)"
              value={formData.password}
              onChange={handleChange}
              required
              minLength="6"
              disabled={isLoading}
              className="auth-input"
            />
            {touched.password && inputError('password', formData.password) && <small id="password-error" role="alert" className="error-message">{inputError('password', formData.password)}</small>}
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
