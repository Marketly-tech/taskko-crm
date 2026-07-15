import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AUTH } from "@/constants/testIds";
import { Building2, ArrowUpRight } from "lucide-react";

export default function Login() {
  const { user, login, error } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@tasko.com");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);

  if (user && user !== false) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await login(email, password);
    setBusy(false);
    if (ok) navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-bone">
      {/* Left brand panel */}
      <div className="relative hidden md:flex flex-col justify-between p-12 bg-forest text-white grain overflow-hidden">
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-9 w-9 rounded-sm bg-wheat text-forest grid place-items-center font-display font-black">
            T
          </div>
          <div>
            <div className="font-display font-black text-2xl tracking-tight leading-none">Tasko</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/60 mt-1">Real Estate CRM</div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/50 mb-4">Built for pre-sales</div>
          <h2 className="font-display font-black text-5xl leading-[1.05] tracking-tight">
            Every lead.<br />
            Every project.<br />
            <span className="text-wheat">One workspace.</span>
          </h2>
          <p className="text-white/70 mt-6 text-sm leading-relaxed max-w-sm">
            Capture leads from MagicBricks, 99acres, Google & Meta. Route them to the right
            executive. Move them through your funnel with WhatsApp, email & site visits — without
            leaving Tasko.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-8 text-[11px] uppercase tracking-[0.2em] text-white/40">
          <div>
            <div className="text-white text-2xl font-display font-bold tracking-tight">10+</div>
            <div className="mt-1">Lead sources</div>
          </div>
          <div>
            <div className="text-white text-2xl font-display font-bold tracking-tight">3</div>
            <div className="mt-1">Access tiers</div>
          </div>
          <div>
            <div className="text-white text-2xl font-display font-bold tracking-tight">∞</div>
            <div className="mt-1">Projects</div>
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 md:p-16">
        <div className="w-full max-w-md">
          <div className="md:hidden mb-8 flex items-center gap-3">
            <div className="h-9 w-9 rounded-sm bg-forest text-wheat grid place-items-center font-display font-black">T</div>
            <span className="font-display font-black text-xl text-forest tracking-tight">Tasko</span>
          </div>

          <div className="text-[10px] uppercase tracking-[0.22em] text-forest/50">Sign in</div>
          <h1 className="font-display font-black text-4xl text-forest tracking-tight mt-2">
            Welcome back.
          </h1>
          <p className="text-sm text-forest/60 mt-3">
            Use one of the seeded accounts — admin, manager, or executive — to explore Tasko.
          </p>

          <form onSubmit={submit} className="mt-10 space-y-5">
            <div>
              <label className="label-caps block mb-2">Email</label>
              <input
                data-testid={AUTH.loginEmail}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 px-3 border border-[#E6E4DD] bg-white rounded-sm text-sm focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest transition-colors duration-150"
                placeholder="admin@tasko.com"
              />
            </div>
            <div>
              <label className="label-caps block mb-2">Password</label>
              <input
                data-testid={AUTH.loginPassword}
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-3 border border-[#E6E4DD] bg-white rounded-sm text-sm focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest transition-colors duration-150"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <div
                data-testid={AUTH.loginError}
                className="text-sm text-clay bg-clay/5 border border-clay/20 rounded-sm px-3 py-2"
              >
                {error}
              </div>
            ) : null}

            <button
              data-testid={AUTH.loginSubmit}
              disabled={busy}
              type="submit"
              className="group w-full h-11 rounded-sm bg-forest text-white font-medium text-sm inline-flex items-center justify-center gap-2 hover:bg-forest-soft transition-colors duration-150 disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Enter workspace"}
              <ArrowUpRight className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-150" />
            </button>
          </form>

          <div className="mt-10 border-t border-[#E6E4DD] pt-6">
            <div className="label-caps mb-3">Try a role</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { r: "Admin", e: "admin@tasko.com", p: "admin123" },
                { r: "Manager", e: "manager@tasko.com", p: "manager123" },
                { r: "Executive", e: "priya@tasko.com", p: "executive123" },
              ].map((x) => (
                <button
                  type="button"
                  key={x.r}
                  onClick={() => { setEmail(x.e); setPassword(x.p); }}
                  data-testid={`try-role-${x.r.toLowerCase()}`}
                  className="border border-[#E6E4DD] bg-white rounded-sm px-2 py-2 text-forest hover:border-forest transition-colors duration-150"
                >
                  <div className="font-semibold">{x.r}</div>
                  <div className="text-forest/50 text-[10px] truncate">{x.e}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
