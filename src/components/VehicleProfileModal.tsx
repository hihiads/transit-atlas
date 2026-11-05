import { useEffect, useState } from 'react';
import { VehicleProfile } from '../types';
import { api } from '../api';

interface VehicleProfileModalProps {
  vehicleId: string;
  onClose: () => void;
}

export default function VehicleProfileModal({ vehicleId, onClose }: VehicleProfileModalProps) {
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getVehicleProfile(vehicleId)
      .then(setProfile)
      .catch(() => setError('Nije moguće učitati profil vozila'))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[2000] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <div className="mt-4 text-gray-600">Učitavanje...</div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[2000] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <div className="text-red-600 mb-4">{error || 'Greška'}</div>
          <button
            onClick={onClose}
            className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Zatvori
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[2000] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-2xl w-full my-8">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">
                {profile.type === 'bus' ? 'Autobus' : 'Tramvaj'}
              </div>
              <div className="text-3xl font-bold text-primary">Linija {profile.line}</div>
              <div className="text-gray-600">{profile.direction}</div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3">Osnovni podaci</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Garažni broj</div>
                  <div className="font-medium">{profile.garageNumber || 'Nije dostupno'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Model</div>
                  <div className="font-medium">{profile.model || 'Nije dostupno'}</div>
                </div>
                {profile.details?.manufacturer && (
                  <div>
                    <div className="text-sm text-gray-500">Proizvođač</div>
                    <div className="font-medium">{profile.details.manufacturer}</div>
                  </div>
                )}
                {profile.details?.modelYear && (
                  <div>
                    <div className="text-sm text-gray-500">Godina modela</div>
                    <div className="font-medium">{profile.details.modelYear}</div>
                  </div>
                )}
              </div>
            </div>

            {profile.details?.features && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-3">Značajke</h3>
                <div className="space-y-2">
                  {profile.details.features.lowFloor !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">Niskopodni pristup</span>
                      {profile.details.features.lowFloor ? (
                        <span className="text-green-600 font-medium">Da</span>
                      ) : (
                        <span className="text-gray-400">Ne</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Klimatizacija</span>
                    <span className="text-gray-400">{profile.details.features.airConditioning || 'Podatak nije dostupan'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">WiFi</span>
                    <span className="text-gray-400">{profile.details.features.wifi || 'Podatak nije dostupan'}</span>
                  </div>
                  {profile.details.capacity && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">Kapacitet</span>
                      <span className="text-gray-600">{profile.details.capacity}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <div className="text-xs text-gray-500 mb-2">Izvor podataka</div>
              <div className="text-sm text-gray-600 bg-gray-100 rounded px-3 py-2">
                {profile.dataSource}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <strong>Napomena:</strong> Prikazani podaci su ogledni. U stvarnoj verziji aplikacije
              ovdje bi bili prikazani provjereni podaci iz službenih izvora.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
