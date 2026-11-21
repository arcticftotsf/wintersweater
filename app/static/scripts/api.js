import { API_BASE_URL } from "./state.js";

export async function request(url, options = {}) {
    const response = await fetch(`${API_BASE_URL}${url}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });

    if (!response.ok) {
        let message = `HTTP error: ${response.status}`;

        try {
            const body = await response.json();
            message = body.detail || message;
        } catch {
            // Ignore invalid response body.
        }

        throw new Error(message);
    }

    if (response.status === 204) return null;
    return response.json();
}
