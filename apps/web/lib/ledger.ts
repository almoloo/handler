import {
  DeviceManagementKitBuilder,
  type DeviceManagementKit,
  type DeviceSessionId,
} from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";
import { firstValueFrom } from "rxjs";

/**
 * One `DeviceManagementKit` instance for the whole app — verified against
 * the actually-installed `@ledgerhq/device-management-kit`/
 * `@ledgerhq/device-transport-kit-web-hid` `.d.ts` files (not assumed from
 * research) before writing this, per `ai-interaction.md`'s rule against
 * inventing SDK calls for less-common libraries.
 */
let dmk: DeviceManagementKit | null = null;

export function getDmk(): DeviceManagementKit {
  dmk ??= new DeviceManagementKitBuilder()
    .addTransport(webHidTransportFactory)
    .build();
  return dmk;
}

/**
 * Discovers and connects to a Ledger device over WebHID, returning the
 * session id every subsequent signer call needs. **Must be called directly
 * from a user gesture (a click handler)** — the DMK's own WebHID
 * discovery use-case requires it (browsers only allow the HID device
 * picker as a direct result of user interaction), so this can't be called
 * from an effect or on mount.
 */
export async function connectLedger(): Promise<DeviceSessionId> {
  const kit = getDmk();
  const device = await firstValueFrom(kit.startDiscovering({}));
  return kit.connect({ device });
}
