import { useEffect, useState } from 'react';
import api from '../api';
import ToastContainer from '../components/ToastContainer';
import useToast from '../hooks/useToast';
import { useAuth } from '../context/AuthContext';

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const { toasts, pushToast, removeToast } = useToast();
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const avatarUrl = user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${API_ORIGIN}${user.avatar_url}`)
    : '';

  useEffect(() => {
    if (!avatarPreview) return undefined;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0] || null;
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : '');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      let updatedUser = user;
      if (name.trim() !== user?.name || newPassword) {
        const response = await api.put('/me', {
          name: name.trim(),
          ...(newPassword ? { current_password: currentPassword, new_password: newPassword } : {}),
        });
        updatedUser = response.data.user;
        updateUser(updatedUser);
      }
      if (avatarFile) {
        const data = new FormData();
        data.append('file', avatarFile);
        const response = await api.post('/me/avatar', data);
        updatedUser = { ...updatedUser, avatar_url: response.data.avatar_url };
        updateUser(updatedUser);
      }
      setCurrentPassword('');
      setNewPassword('');
      setAvatarFile(null);
      pushToast('Your profile has been updated.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not update your profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell profile-page">
      <header className="page-heading">
        <div><p className="eyebrow">Account settings</p><h1>Your profile</h1><p className="page-subtitle">Manage your personal details and security.</p></div>
      </header>
      <section className="panel profile-card">
        <form onSubmit={handleSubmit}>
          <div className="profile-avatar-section">
            <div className="profile-avatar">
              {(avatarPreview || avatarUrl)
                ? <img src={avatarPreview || avatarUrl} alt="Profile" />
                : <span>{user?.name?.charAt(0)?.toUpperCase() || 'U'}</span>}
            </div>
            <div>
              <label className="file-picker avatar-picker">Change photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleAvatarChange}
                />
              </label>
              <p className="field-hint">PNG, JPG, or WEBP. Maximum 5 MB.</p>
            </div>
          </div>
          {error && <div className="error-box form-error" role="alert">{error}</div>}
          <div className="profile-form-grid">
            <label>Full name<input value={name} maxLength="100" onChange={(event) => setName(event.target.value)} required /></label>
            <label>Email address<input value={user?.email || ''} disabled readOnly /></label>
            <label>Role<input value={user?.role || ''} disabled readOnly /></label>
          </div>
          <div className="password-section">
            <h2>Change password</h2>
            <p>Leave these fields blank if you don’t want to change your password.</p>
            <div className="profile-form-grid">
              <label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
              <label>New password<input type="password" autoComplete="new-password" minLength="8" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            </div>
          </div>
          <div className="profile-actions">
            <button className="button button-primary" type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </section>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
