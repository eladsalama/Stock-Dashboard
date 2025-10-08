"use client";
import { useEffect, useState } from "react";

export default function ClearStoragePage() {
  const [cleared, setCleared] = useState(false);
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    // Get all localStorage keys before clearing
    const allKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) allKeys.push(key);
    }
    setKeys(allKeys);
  }, []);

  const clearStorage = () => {
    localStorage.clear();
    setCleared(true);
    // Reload page to reset all components
    setTimeout(() => {
      window.location.href = "/";
    }, 2000);
  };

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1>Clear LocalStorage</h1>

      <h3>Current LocalStorage Keys:</h3>
      <ul>
        {keys.map((key) => (
          <li key={key}>
            <strong>{key}</strong>: {localStorage.getItem(key)?.substring(0, 100)}...
          </li>
        ))}
      </ul>

      {!cleared ? (
        <button
          onClick={clearStorage}
          style={{
            padding: "10px 20px",
            backgroundColor: "#ff4444",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          CLEAR ALL LOCALSTORAGE
        </button>
      ) : (
        <div style={{ color: "green", fontSize: "18px" }}>
          ✅ LocalStorage cleared! Redirecting to home page...
        </div>
      )}
    </div>
  );
}
