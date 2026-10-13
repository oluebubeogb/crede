"""
Multi-vendor LLM gateway for Crede.

Providers (Coolify env LLM_PROVIDER):
  openai    — OpenAI Chat Completions (default base https://api.openai.com/v1)
  runpod    — OpenAI-compatible endpoint (set LLM_BASE_URL to RunPod proxy)
  replicate — Replicate predictions API
  none      — disabled

Public API:
  await chat_json(system, user) -> dict
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger("crede.llm")


class LLMError(Exception):
    pass


def _extract_json(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # fenced ```json ... ```
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass
    # first { ... }
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    raise LLMError("Model did not return valid JSON")


async def _openai_compatible_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
    timeout: float,
) -> str:
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    # OpenAI supports json_object; many OpenAI-compatible proxies ignore unknown fields
    if "openai.com" in base_url:
        body["response_format"] = {"type": "json_object"}

    client_timeout = httpx.Timeout(timeout, connect=min(30.0, timeout), read=timeout, write=timeout, pool=timeout)
    async with httpx.AsyncClient(timeout=client_timeout) as client:
        r = await client.post(url, headers=headers, json=body)
        if r.status_code >= 400:
            raise LLMError(f"LLM HTTP {r.status_code}: {r.text[:400]}")
        data = r.json()
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            raise LLMError(f"Unexpected LLM response shape: {data!r}") from e


async def _replicate_chat(
    *,
    api_key: str,
    model: str,
    system: str,
    user: str,
    max_tokens: int,
    timeout: float,
) -> str:
    """Create a prediction and poll until done (simple path)."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Prefer": "wait",
    }
    # model like "owner/name" or full version path
    create_url = "https://api.replicate.com/v1/models/" + model.strip("/") + "/predictions"
    prompt = f"{system}\n\n{user}\n\nRespond with JSON only."
    payload = {
        "input": {
            "prompt": prompt,
            "max_tokens": max_tokens,
            "temperature": 0.2,
        }
    }
    client_timeout = httpx.Timeout(timeout, connect=min(30.0, timeout), read=timeout, write=timeout, pool=timeout)
    async with httpx.AsyncClient(timeout=client_timeout) as client:
        r = await client.post(create_url, headers=headers, json=payload)
        if r.status_code >= 400:
            # fallback: predictions with version field if model is a version hash
            r = await client.post(
                "https://api.replicate.com/v1/predictions",
                headers=headers,
                json={"version": model, "input": payload["input"]},
            )
            if r.status_code >= 400:
                raise LLMError(f"Replicate HTTP {r.status_code}: {r.text[:400]}")
        data = r.json()
        # Prefer wait may return completed output
        out = data.get("output")
        if out is not None:
            if isinstance(out, list):
                return "".join(str(x) for x in out)
            return str(out)
        status = data.get("status")
        get_url = data.get("urls", {}).get("get") or f"https://api.replicate.com/v1/predictions/{data.get('id')}"
        for _ in range(40):
            if status in ("succeeded", "failed", "canceled"):
                break
            pr = await client.get(get_url, headers=headers)
            data = pr.json()
            status = data.get("status")
            out = data.get("output")
            if status == "succeeded" and out is not None:
                if isinstance(out, list):
                    return "".join(str(x) for x in out)
                return str(out)
        raise LLMError(f"Replicate prediction did not complete: {status}")


async def chat_json(
    system: str,
    user: str,
    *,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """
    Call configured LLM and parse JSON object response.
    Raises LLMError on failure; callers should fall back.
    """
    settings = get_settings()
    if not settings.llm_enabled:
        raise LLMError("LLM disabled or missing API key")

    provider = settings.llm_provider
    key = settings.llm_api_key
    model = settings.llm_model
    timeout = settings.llm_timeout_seconds
    max_tokens = settings.llm_max_tokens

    try:
        if provider in ("openai", "runpod"):
            base = settings.llm_base_url or (
                "https://api.openai.com/v1" if provider == "openai" else ""
            )
            if not base:
                raise LLMError("LLM_BASE_URL required for runpod")
            content = await _openai_compatible_chat(
                base_url=base,
                api_key=key,
                model=model,
                system=system,
                user=user,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout,
            )
        elif provider == "replicate":
            content = await _replicate_chat(
                api_key=key,
                model=model,
                system=system,
                user=user,
                max_tokens=max_tokens,
                timeout=timeout,
            )
        else:
            raise LLMError(f"Unknown LLM_PROVIDER: {provider}")
    except LLMError:
        raise
    except Exception as e:
        logger.exception("LLM call failed")
        raise LLMError(str(e)) from e

    return _extract_json(content)
