import { useCallback, useEffect, useRef, useState } from "react";

import { hasAdminRole, useSession } from "#/lib/auth/client";
import { getFacilityAnalytics, type AnalyticsTimeRange, type FacilityAnalytics } from "#/lib/functions/analytics";
import { getFacilities, type FacilityRow } from "#/lib/functions/facility";
import { getShowAllFacilitiesPreference } from "#/lib/preferences";

export interface PortfolioFacility {
  facility: FacilityRow;
  analytics: FacilityAnalytics;
}

export function usePortfolioAnalytics(range: AnalyticsTimeRange) {
  const { data: session, isPending: isSessionPending } = useSession();
  const [facilities, setFacilities] = useState<PortfolioFacility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestId = useRef(0);

  const userId = session?.user.id;
  const isAdmin = hasAdminRole(session?.user);

  const load = useCallback(
    async (silent = false) => {
      if (!userId) return;

      const currentRequest = ++requestId.current;
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const includeAll = isAdmin && getShowAllFacilitiesPreference(userId);
        const facilityRows = await getFacilities({ data: { includeAll } });
        const analytics = await Promise.all(
          facilityRows.map((facility) => getFacilityAnalytics({ data: { facilityId: facility.id, range } })),
        );

        if (currentRequest !== requestId.current) return;

        setFacilities(facilityRows.map((facility, index) => ({ facility, analytics: analytics[index] })));
        setLastUpdated(new Date());
      } catch (cause) {
        if (currentRequest !== requestId.current) return;
        setError(cause instanceof Error ? cause.message : "Failed to load facility analytics.");
      } finally {
        if (currentRequest === requestId.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [isAdmin, range, userId],
  );

  useEffect(() => {
    if (isSessionPending || !userId) return;
    void load();
  }, [isSessionPending, load, userId]);

  const refresh = useCallback(() => {
    void load(facilities.length > 0);
  }, [facilities.length, load]);

  return { facilities, isLoading, isRefreshing, error, lastUpdated, refresh };
}
