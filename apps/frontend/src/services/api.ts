import type { Ticket, Venue, Zone, RegisterResult, ApiResponse, Currency } from '../types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const json: ApiResponse<T> = await res.json();
  if (!json.success || json.data === undefined) {
    throw new Error(json.error ?? 'Unknown error');
  }
  return json.data;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async login(password: string): Promise<{ token: string }> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  async getVenues(all = false): Promise<Venue[]> {
    return request(`/api/venues${all ? '?all=true' : ''}`);
  },

  async toggleVenue(id: string, active: boolean): Promise<Venue> {
    return request(`/api/venues/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ active }),
    });
  },

  async getZones(venueId: string): Promise<Zone[]> {
    return request(`/api/zones?venueId=${encodeURIComponent(venueId)}`);
  },

  async getTicket(id: string): Promise<{ ticket: Ticket; members: Ticket[] | null; currency: Currency }> {
    return request(`/api/tickets/${encodeURIComponent(id)}`);
  },

  async getTicketGroup(groupId: string): Promise<{ ticket: Ticket; members: Ticket[]; currency: Currency }> {
    return request(`/api/tickets/group/${encodeURIComponent(groupId)}`);
  },

  async register(payload: {
    name: string;
    phone: string;
    venueId: string;
    zoneId: string;
    guests: { name: string }[];
  }): Promise<RegisterResult> {
    return request('/api/tickets/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async uploadReceipt(id: string, file: File): Promise<Ticket> {
    const formData = new FormData();
    formData.append('receipt', file);
    const res = await fetch(`${API_URL}/api/tickets/${encodeURIComponent(id)}/upload-receipt`, {
      method: 'POST',
      body: formData,
    });
    const json: ApiResponse<Ticket> = await res.json();
    if (!json.success || !json.data) throw new Error(json.error ?? 'Upload failed');
    return json.data;
  },

  async checkin(id: string): Promise<Ticket> {
    return request(`/api/tickets/${encodeURIComponent(id)}/checkin`, {
      method: 'POST',
      headers: authHeaders(),
    });
  },

  async checkinGroup(
    groupId: string,
    personIds: string[],
  ): Promise<{ groupId: string; members: Ticket[] }> {
    return request(`/api/tickets/group/${encodeURIComponent(groupId)}/checkin`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ personIds }),
    });
  },

  async getPendingTickets(venueId?: string): Promise<Ticket[]> {
    const params = new URLSearchParams({ status: 'PENDING' });
    if (venueId) params.set('venueId', venueId);
    return request(`/api/tickets?${params.toString()}`, { headers: authHeaders() });
  },

  async updateTicketStatus(id: string, status: 'CONFIRMED' | 'REJECTED'): Promise<Ticket> {
    return request(`/api/tickets/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
  },

  async createVenue(name: string, date: string, currency: Currency): Promise<Venue> {
    return request('/api/venues', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, date, currency }),
    });
  },

  async createZone(data: Omit<Zone, 'id' | 'available'>): Promise<Zone> {
    return request('/api/zones', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
  },

  async updateZone(
    id: string,
    data: Partial<Omit<Zone, 'id' | 'venueId' | 'available'>>,
  ): Promise<Zone> {
    return request(`/api/zones/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
  },

  async deleteZone(id: string): Promise<{ deleted: boolean }> {
    return request(`/api/zones/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
  },
};
