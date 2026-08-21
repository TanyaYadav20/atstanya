import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Input from "../components/Input";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../types/auth";
import "./AuthPage.css";

type Mode = "login" | "register";

interface FormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email format";
  return undefined;
}

function validatePassword(password: string): string | undefined {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return undefined;
}

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Route decides which mode is shown: /login vs /register.
  const mode: Mode = location.pathname === "/register" ? "register" : "login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, register } = useAuth();

  useEffect(() => {
    // AuthPage stays mounted across /register -> /login navigation, so a
    // useState initializer would only see the first location it was
    // mounted with. Read the "registered" flag here instead, on every
    // location change, then clear it so refresh/back doesn't re-show it.
    if ((location.state as { registered?: boolean } | null)?.registered) {
      setSuccessMessage("Account created. Sign in to continue.");
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  function switchMode(next: Mode) {
    navigate(next === "login" ? "/login" : "/register");
    setErrors({});
    setApiError(null);
    setSuccessMessage(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setApiError(null);

    const nextErrors: FormErrors = {
      email: validateEmail(email),
      password: password ? undefined : "Password is required",
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    setIsSubmitting(true);
    try {
      await login({ email, password }, rememberMe);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setApiError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setApiError(null);

    const nextErrors: FormErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword:
        confirmPassword !== password ? "Passwords do not match" : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password || nextErrors.confirmPassword) return;

    setIsSubmitting(true);
    try {
      await register({ email, password });
      navigate("/login", { state: { registered: true } });
    } catch (err) {
      setApiError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-backdrop" aria-hidden="true" />
      <div className="auth-container">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <BrandIcon />
          </div>
          <h1 className="auth-brand-title">AI-ATS</h1>
          <p className="auth-brand-subtitle">AI-Powered Applicant Tracking System</p>
        </div>

        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`auth-tab ${mode === "login" ? "auth-tab-active" : ""}`}
              onClick={() => switchMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={`auth-tab ${mode === "register" ? "auth-tab-active" : ""}`}
              onClick={() => switchMode("register")}
            >
              Register
            </button>
          </div>

          {successMessage && (
            <div className="auth-banner auth-banner-success" role="status">
              {successMessage}
            </div>
          )}
          {apiError && (
            <div className="auth-banner auth-banner-error" role="alert">
              {apiError}
            </div>
          )}

          {mode === "login" ? (
            <form key="login" className="auth-form" onSubmit={handleLogin} noValidate>
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />
              <PasswordInput
                label="Password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
              />

              <div className="auth-row">
                <label className="auth-checkbox">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
              </div>

              <Button type="submit" fullWidth isLoading={isSubmitting}>
                Login
              </Button>

              <p className="auth-switch">
                Don&apos;t have an account?{" "}
                <button type="button" onClick={() => switchMode("register")}>
                  Register
                </button>
              </p>
            </form>
          ) : (
            <form key="register" className="auth-form" onSubmit={handleRegister} noValidate>
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />
              <PasswordInput
                label="Password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                hint={!errors.password ? "Minimum 8 characters" : undefined}
              />
              <PasswordInput
                label="Confirm Password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
              />

              <Button type="submit" fullWidth isLoading={isSubmitting}>
                Create account
              </Button>

              <p className="auth-switch">
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("login")}>
                  Login
                </button>
              </p>
            </form>
          )}
        </div>

        <p className="auth-footer">© {new Date().getFullYear()} AI-ATS. All rights reserved.</p>
      </div>
    </div>
  );
}

function BrandIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5 20 21h-3.4l-1.6-4.2h-6l-1.6 4.2H4L12 2.5Zm0 5.9-2.1 5.5h4.2L12 8.4Z"
        fill="currentColor"
      />
    </svg>
  );
}
