import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

// Extracted from the old osm/geocoding.service.ts (SalahTime app). The
// mosque-specific batch-update methods were removed — this keeps only
// reverseGeocode(), used to auto-fill a property's address when an Owner
// drops a pin on the map in the "Add Property" screen.
interface NominatimResponse {
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly nominatimUrl = 'https://nominatim.openstreetmap.org/reverse';

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const response = await axios.get<NominatimResponse>(this.nominatimUrl, {
        params: {
          format: 'json',
          lat,
          lon: lng,
          zoom: 18,
          addressdetails: 1,
        },
        headers: {
          // Nominatim requires a descriptive User-Agent per their usage policy
          'User-Agent': 'RentalPlatform-App/1.0 (Property listing address lookup)',
        },
        timeout: 10000,
      });

      if (response.data?.address) {
        const addr = response.data.address;
        const parts = [
          addr.house_number,
          addr.road,
          addr.suburb,
          addr.city,
          addr.state,
          addr.postcode,
        ].filter(Boolean);

        if (parts.length > 0) {
          return parts.join(', ');
        }
      }

      return response.data?.display_name ?? null;
    } catch (error) {
      this.logger.error(`Reverse geocoding failed for ${lat}, ${lng}:`, error.message);
      return null;
    }
  }
}
