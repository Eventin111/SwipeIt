import HintedInput from '../../components/HintedInput/HintedInput';
import { INPUT_RULES, inputError } from '../../core/domain/services/authPolicy';
import React, { useRef, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { appConfig } from '../../config/appConfig';
import './LoginPage.css';

const LoginPage = () => {
  const submitRef = useRef(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [touched, setTouched] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  
  const { login } = useContext(AuthContext);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ username: true, email: true, password: true });
    const validationError = inputError('email', formData.email) || (!formData.password ? 'Введите пароль.' : '');
    if (validationError) { setError(validationError); return; }
    if (submitRef.current) return;
    submitRef.current = true;
    setMessage('');
    setError('');
    setIsLoading(true);

    try {
      await login(formData.email, formData.password);
      setMessage('Вход успешен!');
      setTimeout(() => {
        navigate('/');
      }, 300);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Произошла ошибка при входе');
    } finally {
      submitRef.current = false;
      setIsLoading(false);
    }
  };

  // Вход как гость
  const handleGuestLogin = async () => {
    if (submitRef.current) return;
    submitRef.current = true;
    setIsLoading(true);
    try {
      await login(appConfig.guestAccount.email, appConfig.guestAccount.password);
      setMessage('Добро пожаловать как гость!');
      
      setTimeout(() => {
        navigate('/');
      }, 300);
    } catch (err) {
      console.error('Guest login error:', err);
      setError('Ошибка входа как гостя');
    } finally {
      submitRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="auth-card">
        <div className="logo-section">
          <h1 className="logo">Swipelt</h1>
          <p className="subtitle">Войди в аккаунт</p>
        </div>

        <form noValidate onSubmit={handleSubmit} className="auth-form">
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
              hint={'Пароль, указанный при регистрации.'}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              aria-invalid={Boolean(touched.password && (!formData.password ? 'Введите пароль.' : ''))}
              aria-describedby="password-error"
              placeholder="Пароль"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={isLoading}
              className="auth-input"
            />
            {touched.password && (!formData.password ? 'Введите пароль.' : '') && <small id="password-error" role="alert" className="error-message">{(!formData.password ? 'Введите пароль.' : '')}</small>}
          </div>

          <button 
            type="submit" 
            className="auth-button"
            disabled={isLoading}
          >
            {isLoading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        {/* Кнопка гостевого входа */}
        <div className="guest-section">
          <p className="guest-divider">
            <span className="guest-divider-text">или</span>
          </p>
          <button 
            className="guest-button"
            onClick={handleGuestLogin}
            disabled={isLoading}
          >
            👤 Продолжить без регистрации
          </button>
        </div>

        {message && <p className="success-message">{message}</p>}
        {error && <p role="alert" className="error-message">{error}</p>}

        <div className="auth-footer">
          <p>
            Еще нет аккаунта?{' '}
            <span 
              className="link" 
              onClick={() => !isLoading && navigate('/register')}
            >
              Создать
            </span>
          </p>
          <p>
            <span 
              className="link" 
              onClick={() => !isLoading && navigate('/forgot-password')}
            >
              Забыли пароль?
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
