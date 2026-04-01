---
layout: default
permalink: /code/
title: code
# description: Edit the `_data/repositories.yml` and change the `github_users` and `github_repos` lists to include your own GitHub profile and repositories.
nav: true
nav_order: 5
---

# Open Source Overview

{% if site.data.repositories.github_overview %}
{% include repository/overview_card.liquid profile=site.data.repositories.github_overview %}
{% endif %}

# Featured Repositories

{% if site.data.repositories.github_repos %}

<div class="repositories-grid">
  {% for repo in site.data.repositories.github_repos %}
    {% include repository/repo.liquid repository=repo %}
  {% endfor %}
</div>
{% endif %}

<script>
  (function () {
    const CACHE_KEY = 'repoAboutCache:v1';
    const RATE_LIMIT_RESET_KEY = 'repoAboutRateLimitReset:v1';
    const TTL_MS = 24 * 60 * 60 * 1000;

    const nodes = Array.from(document.querySelectorAll('.repo-card-description[data-repo]'));
    if (!nodes.length) return;

    function setFallback(node) {
      const fallback = node.getAttribute('data-fallback');
      if (fallback && fallback.trim().length > 0) {
        node.textContent = fallback;
      }
    }

    function loadCache() {
      try {
        const raw = window.localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (_) {
        return {};
      }
    }

    function saveCache(cache) {
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch (_) {
        // Ignore write failures (private mode/quota).
      }
    }

    function getRateLimitReset() {
      try {
        const raw = window.localStorage.getItem(RATE_LIMIT_RESET_KEY);
        const ts = raw ? Number(raw) : 0;
        return Number.isFinite(ts) ? ts : 0;
      } catch (_) {
        return 0;
      }
    }

    function setRateLimitReset(ts) {
      try {
        window.localStorage.setItem(RATE_LIMIT_RESET_KEY, String(ts));
      } catch (_) {
        // Ignore write failures (private mode/quota).
      }
    }

    async function hydrateDescriptions() {
      const now = Date.now();
      const cache = loadCache();

      const resetAt = getRateLimitReset();
      if (resetAt > now) {
        nodes.forEach(setFallback);
        return;
      }

      const pending = [];

      nodes.forEach((node) => {
        const repo = node.getAttribute('data-repo');
        if (!repo) {
          setFallback(node);
          return;
        }

        const cached = cache[repo];
        if (cached && cached.description && cached.expiresAt && cached.expiresAt > now) {
          node.textContent = cached.description;
          return;
        }

        pending.push({ node, repo });
      });

      for (const item of pending) {
        try {
          const response = await fetch('https://api.github.com/repos/' + item.repo, {
            headers: { Accept: 'application/vnd.github+json' },
          });

          if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
            const resetHeader = response.headers.get('x-ratelimit-reset');
            const resetEpochMs = resetHeader ? Number(resetHeader) * 1000 : Date.now() + 15 * 60 * 1000;
            setRateLimitReset(resetEpochMs);
            setFallback(item.node);
            continue;
          }

          if (!response.ok) {
            setFallback(item.node);
            continue;
          }

          const data = await response.json();
          const fallback = item.node.getAttribute('data-fallback') || '';
          const about = data && data.description ? data.description : fallback;

          item.node.textContent = about;
          cache[item.repo] = {
            description: about,
            expiresAt: Date.now() + TTL_MS,
          };
          saveCache(cache);
        } catch (_) {
          setFallback(item.node);
        }
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hydrateDescriptions);
    } else {
      hydrateDescriptions();
    }
  })();
</script>
