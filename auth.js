// Supabase Auth and per-account cloud persistence. Credentials are never stored here.
(() => {
  const USER_DATA_TABLE = "jee_user_data";
  const PROFILE_TABLE = "profiles";
  const PUBLIC_ROUTES = new Set(["/resources", "/study-with-divyansh"]);
  const AUTH_ROUTES = new Set(["/login", "/signup", "/forgot-password", "/reset-password"]);
  const ROUTES = {
    "/dashboard": "dashboard",
    "/subjects": "subjects",
    "/study": "study",
    "/analysis": "analysis",
    "/tests": "tests",
    "/todo": "todo",
    "/resources": "resources",
    "/study-with-divyansh": "study-with-divyansh",
    "/profile": "profile"
  };
  let client = null;
  let user = null;
  let loadedUserId = null;
  let loadingUserId = null;
  let cloudReady = false;
  let saveTimer = null;
  let queuedSnapshot = null;
  let saveQueue = Promise.resolve();

  function setSyncStatus(message) {
    const status = document.getElementById("sync-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("sync-error", message === "Sync error");
  }

  function getRoute() {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const hashRoute = window.location.hash.slice(1);
    if ((path === "/" || path === "/index.html") && hashRoute) return `/${hashRoute}`;
    if (path === "/" || path === "/index.html") return "/dashboard";
    return path;
  }

  function navigateTo(route, replace = false) {
    if (!route.startsWith("/") || route.endsWith(".html")) return;
    if (replace) history.replaceState({}, "", route);
    else if (window.location.pathname !== route) history.pushState({}, "", route);
    renderRoute(route);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderAuthPage(route) {
    const formRoute = route === "/signup" ? "signup" : route === "/forgot-password" ? "forgot"
      : route === "/reset-password" ? "reset" : "login";
    const content = {
      login: ["Welcome back", "Sign in to pick up where you left off.", 'New to the tracker? <a href="/signup" data-route="/signup">Create an account</a>'],
      signup: ["Start your JEE journey", "Create a private study account that syncs across your devices.", 'Already have an account? <a href="/login" data-route="/login">Sign in</a>'],
      forgot: ["Reset your password", "We’ll email you a secure password-reset link.", 'Remembered your password? <a href="/login" data-route="/login">Sign in</a>'],
      reset: ["Choose a new password", "Use a strong password you don’t use on other sites.", 'Back to <a href="/login" data-route="/login">sign in</a>']
    }[formRoute];
    document.getElementById("auth-heading").textContent = content[0];
    document.getElementById("auth-description").textContent = content[1];
    document.getElementById("auth-switch").innerHTML = content[2];
    document.querySelectorAll("[data-auth-form]").forEach(form => form.classList.toggle("hidden", form.dataset.authForm !== formRoute));
    document.getElementById("backend-setup-notice").classList.toggle("hidden", Boolean(client));
    document.getElementById("auth-forms").classList.toggle("hidden", !client);
    document.getElementById("auth-loading").classList.add("hidden");
  }

  function renderRoute(requestedRoute = getRoute()) {
    let route = requestedRoute;
    if (!ROUTES[route] && !AUTH_ROUTES.has(route)) route = "/dashboard";
    const publicPage = PUBLIC_ROUTES.has(route);
    const protectedPage = Boolean(ROUTES[route]) && !publicPage;
    if (protectedPage && !user) {
      if (getRoute() !== "/login") history.replaceState({}, "", "/login");
      route = "/login";
    }
    if (user && ["/login", "/signup", "/forgot-password"].includes(route)) {
      history.replaceState({}, "", "/dashboard");
      route = "/dashboard";
    }

    const authPage = AUTH_ROUTES.has(route);
    document.body.classList.toggle("public-mode", publicPage && !user);
    document.getElementById("auth-view").classList.toggle("hidden", !authPage);
    document.getElementById("app-shell").classList.toggle("hidden", authPage);
    document.querySelectorAll(".route-section").forEach(section => {
      section.classList.toggle("hidden", section.id !== ROUTES[route]);
    });
    document.querySelectorAll(".nav-link").forEach(link => {
      const active = link.dataset.route === route;
      link.classList.toggle("active", active);
      link.setAttribute("aria-current", active ? "page" : "false");
    });
    const pageTitle = ROUTES[route];
    const displayTitles = {
      dashboard: "Dashboard",
      subjects: "Subject tracker",
      study: "Study sessions",
      analysis: "Weekly analysis",
      tests: "Mock tests",
      todo: "To-do list",
      resources: "Free study material",
      "study-with-divyansh": "Study With Divyansh",
      profile: "My profile"
    };
    if (pageTitle) document.getElementById("page-title").textContent = displayTitles[pageTitle];
    const authTitle = route === "/signup" ? "Create account" : route === "/forgot-password"
      ? "Reset password" : route === "/reset-password" ? "Choose a new password" : "Sign in";
    document.title = `JEE PHODENGE · ${pageTitle ? displayTitles[pageTitle] : authTitle}`;

    const profileLink = document.getElementById("profile-avatar");
    profileLink.href = user ? "/profile" : "/login";
    profileLink.dataset.route = user ? "/profile" : "/login";
    profileLink.setAttribute("aria-label", user ? "My profile" : "Sign in");
    profileLink.textContent = user ? document.getElementById("sidebar-avatar").textContent : "↗";
    if (authPage) renderAuthPage(route);
    if (user && ROUTES[route]) {
      window.jeeTracker.renderProfile();
      if (route === "/todo") window.jeeTracker.renderTasks();
    }
  }

  function showAuthMessage(message, isError = false) {
    const element = document.getElementById("auth-message");
    element.textContent = message;
    element.classList.remove("hidden", "auth-error");
    if (isError) element.classList.add("auth-error");
  }

  function clearAuthMessage() {
    const element = document.getElementById("auth-message");
    element.textContent = "";
    element.classList.add("hidden");
    element.classList.remove("auth-error");
  }

  function showSetupError(message) {
    document.getElementById("auth-loading").classList.add("hidden");
    document.getElementById("backend-setup-notice").classList.remove("hidden");
    document.querySelector("#backend-setup-notice span").textContent = message;
  }

  async function saveSnapshot(snapshot) {
    saveQueue = saveQueue.then(async () => {
      if (!client || !user || !cloudReady || user.id !== snapshot.userId) return;
      setSyncStatus("Saving…");
      const { error } = await client.from(USER_DATA_TABLE).upsert({
        user_id: snapshot.userId,
        data: snapshot.data,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (error) throw error;
      if (user?.id === snapshot.userId) setSyncStatus("Synced");
    }).catch(error => {
      if (user?.id === snapshot.userId) {
        setSyncStatus("Sync error");
        window.jeeTracker.showToast(`Could not sync your changes to Supabase: ${error.message}. Click Sync error to retry.`, true);
      }
    }).finally(() => {
      if (queuedSnapshot) flushCloudState();
    });
    return saveQueue;
  }

  function flushCloudState() {
    if (!queuedSnapshot) return saveQueue;
    const snapshot = queuedSnapshot;
    queuedSnapshot = null;
    return saveSnapshot(snapshot);
  }

  function queueCloudState(data, immediate = false) {
    if (!user || !cloudReady) {
      window.jeeTracker.showToast("Sign in to save changes to your private study account.", true);
      return false;
    }
    const snapshot = { userId: user.id, data: JSON.parse(JSON.stringify(data)) };
    try {
      localStorage.setItem(`${window.jeeTracker.storageKey}:${user.id}`, JSON.stringify(data));
    } catch (error) {
      window.jeeTracker.showToast(`Could not save your local backup: ${error.message}`, true);
    }
    queuedSnapshot = snapshot;
    setSyncStatus("Saving…");
    clearTimeout(saveTimer);
    if (immediate) flushCloudState();
    else saveTimer = setTimeout(flushCloudState, 350);
    return true;
  }

  function validCloudDocument(data) {
    return data && typeof data === "object" && !Array.isArray(data)
      && data.chapters && typeof data.chapters === "object"
      && Array.isArray(data.sessions) && Array.isArray(data.tests);
  }

  async function loadAuthenticatedUser(authenticatedUser) {
    if (!client || !authenticatedUser?.id) return;
    if (loadedUserId === authenticatedUser.id && cloudReady) {
      renderRoute(getRoute());
      return;
    }
    if (loadingUserId === authenticatedUser.id) return;
    loadingUserId = authenticatedUser.id;
    user = authenticatedUser;
    cloudReady = false;
    loadedUserId = null;
    setSyncStatus("Loading…");
    try {
      const [{ data: remote, error: dataError }, { data: profile, error: profileError }] = await Promise.all([
        client.from(USER_DATA_TABLE).select("data").eq("user_id", authenticatedUser.id).maybeSingle(),
        client.from(PROFILE_TABLE).select("display_name").eq("id", authenticatedUser.id).maybeSingle()
      ]);
      if (dataError) throw dataError;
      if (profileError) throw profileError;
      if (user?.id !== authenticatedUser.id) return;
      user.profileName = profile?.display_name || authenticatedUser.user_metadata?.full_name || authenticatedUser.email?.split("@")[0] || "Student";
      if (!profile) {
        const { error } = await client.from(PROFILE_TABLE).upsert({
          id: authenticatedUser.id,
          display_name: user.profileName,
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
      }

      let createCloudRow = false;
      if (remote) {
        if (!validCloudDocument(remote.data)) throw new Error("The saved study record is incomplete. Your data was not overwritten.");
        window.jeeTracker.setState(window.jeeTracker.loadState(JSON.stringify(remote.data)));
      } else {
        const legacyData = localStorage.getItem(window.jeeTracker.storageKey);
        const cache = localStorage.getItem(`${window.jeeTracker.storageKey}:${authenticatedUser.id}`);
        const candidate = legacyData || cache;
        if (candidate && window.confirm("Existing JEE tracker data was found in this browser. Import it into this signed-in account? It will remain on this device as a local backup.")) {
          window.jeeTracker.setState(window.jeeTracker.loadState(candidate));
        } else {
          window.jeeTracker.setState(window.jeeTracker.createDefaultState());
        }
        createCloudRow = true;
      }
      if (user?.id !== authenticatedUser.id) return;
      cloudReady = true;
      loadedUserId = authenticatedUser.id;
      window.jeeTracker.renderAll();
      renderRoute(getRoute());
      if (createCloudRow) {
        const { error } = await client.from(USER_DATA_TABLE).upsert({
          user_id: authenticatedUser.id,
          data: window.jeeTracker.state,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });
        if (error) throw error;
      }
      setSyncStatus("Synced");
    } catch (error) {
      if (user?.id !== authenticatedUser.id) return;
      user = null;
      cloudReady = false;
      loadedUserId = null;
      window.jeeTracker.setState(window.jeeTracker.createDefaultState());
      history.replaceState({}, "", "/login");
      renderRoute("/login");
      showAuthMessage(`Could not load your private study data: ${error.message}. Check that the database migration and row-level security policies are configured.`, true);
    } finally {
      if (loadingUserId === authenticatedUser.id) loadingUserId = null;
    }
  }

  function handleSignedOut() {
    user = null;
    loadedUserId = null;
    loadingUserId = null;
    cloudReady = false;
    queuedSnapshot = null;
    window.jeeTracker.setState(window.jeeTracker.createDefaultState());
    navigateTo("/login", true);
    setSyncStatus("Cloud sync");
  }

  async function submitAuthForm(form, handler) {
    clearAuthMessage();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await handler();
    } catch (error) {
      showAuthMessage(error.message || "The request failed. Please try again.", true);
    } finally {
      button.disabled = false;
    }
  }

  function bindAuthForms() {
    document.getElementById("login-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!client) return;
      submitAuthForm(event.currentTarget, async () => {
        const { error } = await client.auth.signInWithPassword({
          email: document.getElementById("login-email").value.trim(),
          password: document.getElementById("login-password").value
        });
        if (error) throw error;
      });
    });
    document.getElementById("signup-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!client) return;
      submitAuthForm(event.currentTarget, async () => {
        const name = document.getElementById("signup-name").value.trim();
        if (!name) throw new Error("Enter your name to create an account.");
        const { data, error } = await client.auth.signUp({
          email: document.getElementById("signup-email").value.trim(),
          password: document.getElementById("signup-password").value,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}/dashboard`
          }
        });
        if (error) throw error;
        if (!data.session) showAuthMessage("Account created. Check your email and confirm the address before signing in.");
      });
    });
    document.getElementById("forgot-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!client) return;
      submitAuthForm(event.currentTarget, async () => {
        const { error } = await client.auth.resetPasswordForEmail(
          document.getElementById("forgot-email").value.trim(),
          { redirectTo: `${window.location.origin}/reset-password` }
        );
        if (error) throw error;
        showAuthMessage("If an account exists for that email, a secure password-reset link is on its way.");
      });
    });
    document.getElementById("reset-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!client) return;
      submitAuthForm(event.currentTarget, async () => {
        const password = document.getElementById("reset-password").value;
        if (password !== document.getElementById("reset-password-confirm").value) {
          throw new Error("The passwords don’t match. Please check and try again.");
        }
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        showAuthMessage("Your password has been updated.");
        navigateTo("/dashboard");
      });
    });
  }

  async function signOut() {
    if (!client) return;
    clearTimeout(saveTimer);
    await flushCloudState();
    const { error } = await client.auth.signOut();
    if (error) window.jeeTracker.showToast(`Could not sign out: ${error.message}`, true);
  }

  async function updateProfile(name) {
    if (!client || !user || !cloudReady) throw new Error("Sign in before updating your profile.");
    const displayName = name.trim();
    if (!displayName || displayName.length > 80) throw new Error("Enter a name between 1 and 80 characters.");
    const { error: authError } = await client.auth.updateUser({ data: { full_name: displayName } });
    if (authError) throw authError;
    const { error: profileError } = await client.from(PROFILE_TABLE).upsert({
      id: user.id,
      display_name: displayName,
      updated_at: new Date().toISOString()
    });
    if (profileError) throw profileError;
    user.profileName = displayName;
    window.jeeTracker.renderDashboard();
    window.jeeTracker.renderProfile();
  }

  function bindRouting() {
    document.addEventListener("click", event => {
      const routeLink = event.target.closest("a[data-route]");
      if (!routeLink || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateTo(routeLink.dataset.route);
    });
    document.getElementById("signout-button").addEventListener("click", signOut);
    document.getElementById("profile-signout").addEventListener("click", signOut);
    document.getElementById("profile-form").addEventListener("submit", event => {
      event.preventDefault();
      updateProfile(document.getElementById("profile-name").value)
        .then(() => window.jeeTracker.showToast("Profile updated."))
        .catch(error => window.jeeTracker.showToast(`Could not update your profile: ${error.message}`, true));
    });
    document.getElementById("sync-status").addEventListener("click", () => {
      if (queuedSnapshot) flushCloudState();
      else if (user && cloudReady) queueCloudState(window.jeeTracker.state, true);
    });
    window.addEventListener("popstate", () => renderRoute(getRoute()));
    window.addEventListener("online", () => {
      if (queuedSnapshot) flushCloudState();
    });
    const route = getRoute();
    if (window.location.pathname.endsWith(".html")) navigateTo(route, true);
    else renderRoute(route);
    window.jeeTracker.renderHeader();
  }

  async function initialize() {
    bindRouting();
    bindAuthForms();
    const config = window.JEE_PHODENGE_CONFIG;
    if (!window.supabase?.createClient) {
      if (!PUBLIC_ROUTES.has(getRoute())) renderRoute(AUTH_ROUTES.has(getRoute()) ? getRoute() : "/login");
      showSetupError("The Supabase browser SDK could not be loaded. Check your internet connection and try again.");
      return;
    }
    if (!config?.supabaseUrl || !config?.supabaseAnonKey
      || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(config.supabaseUrl.trim())
      || config.supabaseAnonKey.trim().length < 20) {
      if (!PUBLIC_ROUTES.has(getRoute())) renderRoute(AUTH_ROUTES.has(getRoute()) ? getRoute() : "/login");
      showSetupError("Set SUPABASE_URL and SUPABASE_ANON_KEY in config.js to connect your real Supabase project. Both are public browser values; never use the service-role key.");
      return;
    }
    client = window.supabase.createClient(config.supabaseUrl.trim(), config.supabaseAnonKey.trim(), {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: "pkce" }
    });
    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") navigateTo("/reset-password", true);
      if (!session) {
        if (user) handleSignedOut();
        else renderRoute(getRoute());
        return;
      }
      window.setTimeout(() => loadAuthenticatedUser(session.user), 0);
    });
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data.session) await loadAuthenticatedUser(data.session.user);
      else renderRoute(getRoute());
    } catch (error) {
      renderRoute("/login");
      showAuthMessage(`Could not restore a secure sign-in session: ${error.message}`, true);
    }
  }

  window.jeeAuth = {
    initialize,
    saveState: data => queueCloudState(data),
    signOut,
    updateProfile,
    get user() { return user; },
    get cloudReady() { return cloudReady; }
  };
  document.addEventListener("DOMContentLoaded", initialize);
})();
