import type { Ticket, Venue, Zone, Seat, ZoneTable, RegisterResult, ApiResponse, Currency, TicketStatus, ZoneType, ZoneLayoutData, GridLayout, GridTemplate, GridTemplateSummary, GridTemplateZoneSlot, CartItem, CreatePaymentResult, PaymentStatusResult } from '../types';

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
    return request(`/api/venues${qs ? `?${qs}` : ''}`);
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

  async getTicket(id: string): Promise<{ ticket: Ticket; members: Ticket[] | null; currency: Currency }> {
    return request(`/api/tickets/${encodeURIComponent(id)}`);
  },

  async getTicketGroup(groupId: string): Promise<{ ticket: Ticket; members: Ticket[]; currency: Currency }> {
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

  async createPayment(ticketId: string): Promise<CreatePaymentResult> {
    return request('/api/payments', {
      method: 'POST',
      body: JSON.stringify({ ticketId }),
    });
  },

  async getPaymentStatus(paymentId: string, returnToken?: string): Promise<PaymentStatusResult> {
    const params = returnToken ? `?token=${encodeURIComponent(returnToken)}` : '';
    return request(`/api/payments/${encodeURIComponent(paymentId)}/status${params}`);
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

  async generateSeats(
    zoneId: string,
    payload: {
      sections: { label: string; rows: number; seatsPerRow: number }[];
      numberingOrder?: 'row-first' | 'section-first';
      startFrom?: number;
    },
  ): Promise<{ count: number }> {
    return request(`/api/zones/${encodeURIComponent(zoneId)}/generate-seats`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  },

  async deleteSeats(zoneId: string): Promise<{ deleted: number }> {
    return request(`/api/zones/${encodeURIComponent(zoneId)}/seats`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
  },

  async getTables(zoneId: string): Promise<ZoneTable[]> {
    return request(`/api/zones/${encodeURIComponent(zoneId)}/tables`);
  },

  async generateTables(
    zoneId: string,
    payload: { count: number; shape?: 'ROUND' | 'RECT'; chairCount: number },
  ): Promise<{ count: number; totalSeats: number }> {
    return request(`/api/zones/${encodeURIComponent(zoneId)}/generate-tables`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  },

  async updateZoneLayout(
    id: string,
    layoutData: ZoneLayoutData | null,
    type?: ZoneType,
  ): Promise<Zone> {
    return request(`/api/zones/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ layoutData, ...(type && { type }) }),
    });
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
