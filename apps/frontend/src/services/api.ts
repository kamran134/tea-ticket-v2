import type { Ticket, PublicTicket, Venue, Zone, Seat, ZoneTable, RegisterResult, ApiResponse, Currency, TicketStatus, GridLayout, GridTemplate, GridTemplateSummary, GridTemplateZoneSlot, CartItem } from '../types';

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

  async getVenues(opts: { all?: boolean; upcoming?: boolean } = {}): Promise<Venue[]> {
    const params = new URLSearchParams();
    if (opts.all) params.set('all', 'true');
    if (opts.upcoming) params.set('upcoming', 'true');
    const qs = params.toString();
    // all=true is admin-only server-side now; harmless no-op header otherwise.
    return request(`/api/venues${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  },

  async getVenueBySlug(slug: string): Promise<Venue> {
    return request(`/api/venues/by-slug/${encodeURIComponent(slug)}`);
  },

  async checkSlugAvailable(slug: string, excludeId?: string): Promise<{ slug: string; available: boolean }> {
    const params = new URLSearchParams({ slug });
    if (excludeId) params.set('excludeId', excludeId);
    return request(`/api/venues/slug-available?${params.toString()}`, {
      headers: authHeaders(),
    });
  },

  async toggleVenue(id: string, active: boolean): Promise<Venue> {
    return request(`/api/venues/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ active }),
    });
  },

  async updateVenue(id: string, data: { name?: string; date?: string }): Promise<Venue> {
    return request(`/api/venues/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
  },

  async uploadFloorPlan(id: string, file: File): Promise<Venue> {
    const formData = new FormData();
    formData.append('floorPlan', file);
    const res = await fetch(`${API_URL}/api/venues/${encodeURIComponent(id)}/upload-floor-plan`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    const json: ApiResponse<Venue> = await res.json();
    if (!json.success || !json.data) throw new Error(json.error ?? 'Upload failed');
    return json.data;
  },

  async clearFloorPlan(id: string): Promise<Venue> {
    return request(`/api/venues/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ floorPlanImage: null }),
    });
  },

  async uploadPoster(id: string, file: File): Promise<Venue> {
    const formData = new FormData();
    formData.append('poster', file);
    const res = await fetch(`${API_URL}/api/venues/${encodeURIComponent(id)}/upload-poster`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    const json: ApiResponse<Venue> = await res.json();
    if (!json.success || !json.data) throw new Error(json.error ?? 'Upload failed');
    return json.data;
  },

  async updateVenueSlug(id: string, slug: string): Promise<Venue> {
    return request(`/api/venues/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ slug }),
    });
  },

  async getZones(venueId: string): Promise<Zone[]> {
    return request(`/api/zones?venueId=${encodeURIComponent(venueId)}`);
  },

  async getTicket(id: string): Promise<{ ticket: PublicTicket; members: PublicTicket[] | null; currency: Currency }> {
    return request(`/api/tickets/${encodeURIComponent(id)}`);
  },

  async getTicketGroup(groupId: string): Promise<{ ticket: PublicTicket; members: PublicTicket[]; currency: Currency }> {
    return request(`/api/tickets/group/${encodeURIComponent(groupId)}`);
  },

  async register(payload: {
    name: string;
    phone: string;
    email: string;
    venueId: string;
    items: CartItem[];
    guestNames?: string[];
  }): Promise<RegisterResult> {
    return request('/api/tickets/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Receipts are no longer plain static files — this hits the authenticated
  // GET /:id/receipt route and hands back the raw bytes for the caller to
  // open as a blob URL, since a plain <a href> can't carry an auth header.
  async getReceiptBlob(id: string): Promise<Blob> {
    const res = await fetch(`${API_URL}/api/tickets/${encodeURIComponent(id)}/receipt`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as ApiResponse<never> | null;
      throw new Error(json?.error ?? 'Failed to load receipt');
    }
    return res.blob();
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

  async getTickets(venueId?: string, status?: TicketStatus): Promise<Ticket[]> {
    const params = new URLSearchParams();
    if (venueId) params.set('venueId', venueId);
    if (status) params.set('status', status);
    return request(`/api/tickets?${params.toString()}`, { headers: authHeaders() });
  },

  async deleteTicket(id: string): Promise<{ deleted: boolean }> {
    return request(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
  },

  async updateTicketStatus(id: string, status: 'CONFIRMED' | 'REJECTED'): Promise<Ticket> {
    return request(`/api/tickets/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
  },

  async createVenue(name: string, date: string, slug?: string): Promise<Venue> {
    return request('/api/venues', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, date, ...(slug && { slug }) }),
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

  async getSeats(zoneId: string): Promise<Seat[]> {
    return request(`/api/zones/${encodeURIComponent(zoneId)}/seats`);
  },

  async getTables(zoneId: string): Promise<ZoneTable[]> {
    return request(`/api/zones/${encodeURIComponent(zoneId)}/tables`);
  },

  // Seats+tables for every zone of the venue in one call — used by the grid
  // map instead of one getSeats/getTables request per zone.
  async getGridData(venueId: string): Promise<{ seats: Seat[]; tables: ZoneTable[] }> {
    return request(`/api/venues/${encodeURIComponent(venueId)}/grid-data`);
  },

  async saveGridLayout(venueId: string, layout: GridLayout): Promise<{ venue: Venue; zones: Zone[] }> {
    return request(`/api/venues/${encodeURIComponent(venueId)}/grid-layout`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(layout),
    });
  },

  async getGridTemplates(): Promise<GridTemplateSummary[]> {
    return request('/api/grid-templates', { headers: authHeaders() });
  },

  async getGridTemplate(id: string): Promise<GridTemplate> {
    return request(`/api/grid-templates/${encodeURIComponent(id)}`, { headers: authHeaders() });
  },

  async saveGridTemplate(payload: {
    name: string;
    rows: number;
    cols: number;
    cells: GridLayout['cells'];
    zones: GridTemplateZoneSlot[];
  }): Promise<GridTemplate> {
    return request('/api/grid-templates', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  },

  async deleteGridTemplate(id: string): Promise<{ deleted: boolean }> {
    return request(`/api/grid-templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
  },
};
