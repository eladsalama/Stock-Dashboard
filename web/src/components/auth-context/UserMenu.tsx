"use client";

import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../../lib/api";

// Google Identity Services types
// Google One Tap types
interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

// Modal backdrop component
const ModalBackdrop: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({
  onClose,
  children,
}) => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      backdropFilter: "blur(8px)",
      zIndex: 9998,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "8px",
    }}
    onClick={onClose}
  >
    <div onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>
);

// Login Modal Component
const LoginModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { login, theme } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = isLogin
        ? await api.authLogin(email, password)
        : await api.authRegister(email, password, name);

      login(result.token, result.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError(
        "Google OAuth not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable.",
      );
      return;
    }

    try {
      // Load Google Identity Services script if not already loaded
      if (!window.google) {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      // Initialize Google Identity Services
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: GoogleCredentialResponse) => {
            try {
              setLoading(true);
              setError("");

              // Send the credential to your backend
              const result = await api.authGoogle(response.credential);
              login(result.token, result.user);
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Google authentication failed");
            } finally {
              setLoading(false);
            }
          },
        });

        // Show the One Tap dialog
        window.google.accounts.id.prompt();
      } else {
        setError("Google authentication service failed to load");
      }
    } catch {
      setError("Failed to load Google authentication");
    }
  };

  return (
    <div
      style={{
        backgroundColor: theme === "light" ? "#ffffff" : "#161b22",
        border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
        borderRadius: "12px",
        boxShadow: theme === "light" ? "0 8px 28px rgba(0,0,0,0.15)" : "0 8px 28px rgba(0,0,0,0.8)",
        padding: "24px",
        width: "100%",
        maxWidth: "400px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "600",
            color: theme === "light" ? "#24292f" : "#e6edf3",
            margin: 0,
          }}
        >
          {isLogin ? "Sign In" : "Create Account"}
        </h2>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            color: theme === "light" ? "#656d76" : "#7d8590",
            padding: "4px",
          }}
        >
          ×
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            backgroundColor: theme === "light" ? "#fff1f3" : "#2d1b1e",
            border: theme === "light" ? "1px solid #ffb3ba" : "1px solid #5c2d2d",
            borderRadius: "8px",
            color: "#d1242f",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              marginBottom: "6px",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              fontWeight: "500",
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "8px 12px",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
              borderRadius: "6px",
              fontSize: "14px",
              backgroundColor: theme === "light" ? "#ffffff" : "#0d1117",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              boxSizing: "border-box",
            }}
          />
        </div>

        {!isLogin && (
          <div>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                marginBottom: "6px",
                color: theme === "light" ? "#24292f" : "#e6edf3",
                fontWeight: "500",
              }}
            >
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: theme === "light" ? "#ffffff" : "#0d1117",
                color: theme === "light" ? "#24292f" : "#e6edf3",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        <div>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              marginBottom: "6px",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              fontWeight: "500",
            }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "8px 12px",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
              borderRadius: "6px",
              fontSize: "14px",
              backgroundColor: theme === "light" ? "#ffffff" : "#0d1117",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            backgroundColor: loading ? "#6c757d" : "#0969da",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            padding: "12px 16px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
        </button>
      </form>

      <div style={{ margin: "16px 0", textAlign: "center", position: "relative" }}>
        <hr
          style={{
            border: "none",
            borderTop: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
          }}
        />
        <span
          style={{
            backgroundColor: theme === "light" ? "#ffffff" : "#161b22",
            color: theme === "light" ? "#656d76" : "#7d8590",
            padding: "0 8px",
            position: "absolute",
            top: "-10px",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "14px",
          }}
        >
          or
        </span>
      </div>

      <button
        onClick={handleGoogleLogin}
        style={{
          width: "100%",
          border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
          backgroundColor: "transparent",
          color: theme === "light" ? "#24292f" : "#e6edf3",
          borderRadius: "6px",
          padding: "12px 16px",
          fontSize: "14px",
          fontWeight: "500",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path
            fill="#4285f4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34a853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#fbbc05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#ea4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </button>

      <div style={{ marginTop: "16px", textAlign: "center" }}>
        <button
          onClick={() => setIsLogin(!isLogin)}
          style={{
            background: "none",
            border: "none",
            color: "#0969da",
            fontSize: "14px",
            cursor: "pointer",
            textDecoration: "none",
          }}
        >
          {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
};

// Manage Account Modal Component
const ManageAccountModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user, theme, login } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [name, setName] = useState(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setError("Current password is required");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const updates: {
        currentPassword: string;
        email?: string;
        name?: string;
        newPassword?: string;
      } = { currentPassword };
      if (email !== user?.email) updates.email = email;
      if (name !== user?.name) updates.name = name;
      if (newPassword) updates.newPassword = newPassword;

      const result = await api.updateAccount(updates);

      if (result.token) {
        login(result.token, result.user);
      }

      setSuccess("Account updated successfully");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: theme === "light" ? "#ffffff" : "#161b22",
        border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
        borderRadius: "12px",
        boxShadow: theme === "light" ? "0 8px 28px rgba(0,0,0,0.15)" : "0 8px 28px rgba(0,0,0,0.8)",
        padding: "24px",
        width: "100%",
        maxWidth: "800px",
        position: "relative",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          background: "none",
          border: "none",
          fontSize: "20px",
          cursor: "pointer",
          color: theme === "light" ? "#656d76" : "#7d8590",
          padding: "4px",
        }}
      >
        ×
      </button>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "600",
            color: theme === "light" ? "#24292f" : "#e6edf3",
            margin: "0 0 16px 0",
            textAlign: "center",
          }}
        >
          Manage Account
        </h2>

        {/* Profile picture back to center, above email field */}
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            backgroundColor: "#0969da",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "20px",
            fontWeight: "bold",
          }}
        >
          {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            backgroundColor: theme === "light" ? "#fff1f3" : "#2d1b1e",
            border: theme === "light" ? "1px solid #ffb3ba" : "1px solid #5c2d2d",
            borderRadius: "8px",
            color: "#d1242f",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            backgroundColor: theme === "light" ? "#f6fff8" : "#1b2d1b",
            border: theme === "light" ? "1px solid #a3e2a8" : "1px solid #2d5a2d",
            borderRadius: "8px",
            color: "#1a7f37",
            fontSize: "14px",
          }}
        >
          {success}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              marginBottom: "6px",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              fontWeight: "500",
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "8px 12px",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
              borderRadius: "6px",
              fontSize: "14px",
              backgroundColor: theme === "light" ? "#ffffff" : "#0d1117",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              marginBottom: "6px",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              fontWeight: "500",
            }}
          >
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
              borderRadius: "6px",
              fontSize: "14px",
              backgroundColor: theme === "light" ? "#ffffff" : "#0d1117",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              marginBottom: "6px",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              fontWeight: "500",
            }}
          >
            Current Password *
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            placeholder="Required for any changes"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
              borderRadius: "6px",
              fontSize: "14px",
              backgroundColor: theme === "light" ? "#ffffff" : "#0d1117",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              marginBottom: "6px",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              fontWeight: "500",
            }}
          >
            New Password (optional)
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Leave blank to keep current password"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
              borderRadius: "6px",
              fontSize: "14px",
              backgroundColor: theme === "light" ? "#ffffff" : "#0d1117",
              color: theme === "light" ? "#24292f" : "#e6edf3",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "center", paddingTop: "8px" }}>
          <button
            type="submit"
            disabled={loading || !currentPassword}
            style={{
              backgroundColor: loading || !currentPassword ? "#6c757d" : "#0969da",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              padding: "12px 24px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: loading || !currentPassword ? "not-allowed" : "pointer",
              opacity: loading || !currentPassword ? 0.7 : 1,
              minWidth: "120px",
            }}
          >
            {loading ? "Updating..." : "Update Account"}
          </button>
        </div>
      </form>
    </div>
  );
};

// Main UserMenu Component
export const UserMenu: React.FC = () => {
  const { user, token, logout, toggleTheme, theme } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const handleLogout = () => {
    logout();
    setDropdownOpen(false);
    window.location.href = "/";
  };

  const userInitial =
    user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "?";

  return (
    <>
      {/* Modals */}
      {showLogin && (
        <ModalBackdrop onClose={() => setShowLogin(false)}>
          <LoginModal onClose={() => setShowLogin(false)} />
        </ModalBackdrop>
      )}

      {showManage && (
        <ModalBackdrop onClose={() => setShowManage(false)}>
          <ManageAccountModal onClose={() => setShowManage(false)} />
        </ModalBackdrop>
      )}

      {/* User Avatar Button */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            backgroundColor: "#0969da",
            color: "#ffffff",
            border: "none",
            fontSize: "12px",
            fontWeight: "500",
            cursor: "pointer",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#0860ca";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#0969da";
          }}
        >
          {userInitial}
        </button>

        {/* Dropdown Menu - positioned below avatar */}
        {dropdownOpen && (
          <div
            style={{
              position: "absolute",
              right: "0",
              top: "100%",
              marginTop: "8px",
              width: "220px",
              backgroundColor: theme === "light" ? "#ffffff" : "#161b22",
              border: theme === "light" ? "1px solid #d0d7de" : "1px solid #30363d",
              borderRadius: "12px",
              boxShadow:
                theme === "light" ? "0 8px 28px rgba(0,0,0,0.15)" : "0 8px 28px rgba(0,0,0,0.8)",
              padding: "12px",
              zIndex: 50,
            }}
          >
            {/* User greeting section */}
            {token && user && (
              <div
                style={{
                  marginBottom: "12px",
                  paddingBottom: "8px",
                  borderBottom: theme === "light" ? "1px solid #eaeef2" : "1px solid #21262d",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: theme === "light" ? "#24292f" : "#e6edf3",
                    marginBottom: "2px",
                  }}
                >
                  Hey {user.name || "there"}!
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: theme === "light" ? "#656d76" : "#7d8590",
                  }}
                >
                  {user.email}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                toggleTheme();
                setDropdownOpen(false);
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                textAlign: "left",
                fontSize: "14px",
                color: theme === "light" ? "#24292f" : "#e6edf3",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme === "light" ? "#f6f8fa" : "#30363d";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              Switch to {theme === "light" ? "Dark" : "Light"} Mode
            </button>

            {token ? (
              <>
                <button
                  onClick={() => {
                    setShowManage(true);
                    setDropdownOpen(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    textAlign: "left",
                    fontSize: "14px",
                    color: theme === "light" ? "#24292f" : "#e6edf3",
                    backgroundColor: "transparent",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                    marginBottom: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      theme === "light" ? "#f6f8fa" : "#30363d";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Manage Account
                </button>

                <button
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    textAlign: "left",
                    fontSize: "14px",
                    color: "#d1242f",
                    backgroundColor: "transparent",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      theme === "light" ? "#fff1f3" : "#2d1b1e";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setShowLogin(true);
                  setDropdownOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  textAlign: "left",
                  fontSize: "14px",
                  color: theme === "light" ? "#24292f" : "#e6edf3",
                  backgroundColor: "transparent",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme === "light" ? "#f6f8fa" : "#30363d";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Log in
              </button>
            )}
          </div>
        )}
      </div>

      {/* Click outside to close dropdown */}
      {dropdownOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
          }}
          onClick={() => setDropdownOpen(false)}
        />
      )}
    </>
  );
};

export default UserMenu;
