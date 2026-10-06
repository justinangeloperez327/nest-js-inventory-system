import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { UpdateSettingsDto } from './dto/update-settings.dto.js';
import {
  DEFAULT_APPLICATION_SETTINGS,
  SETTINGS_KEYS,
  STOCK_COUNT_CONCURRENCY_POLICIES,
  type StockCountConcurrencyPolicy,
} from './settings.constants.js';

type SettingsClient = Pick<
  Prisma.TransactionClient,
  'systemSetting'
>;

interface SettingsSnapshot {
  organizationName: string;
  timezone: string;
  currencyCode: string;
  defaultPageSize: number;
  allowNegativeStock: boolean;
  stockCountConcurrencyPolicy:
    StockCountConcurrencyPolicy;
  updatedAt?: Date;
  updatedBy?: {
    id: string;
    name: string;
  };
}

const SETTING_KEYS = Object.values(
  SETTINGS_KEYS,
);

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get(): Promise<SettingsSnapshot> {
    return this.load(this.prisma);
  }

  options() {
    return {
      timezones:
        this.supportedTimezones(),
      currencies:
        this.supportedCurrencies(),
    };
  }

  async update(
    dto: UpdateSettingsDto,
    userId: string,
  ): Promise<SettingsSnapshot> {
    const normalized =
      this.normalize(dto);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))',
          'application-settings',
        );

        const before =
          await this.load(tx);

        for (const [key, value] of [
          [
            SETTINGS_KEYS.OrganizationName,
            normalized.organizationName,
          ],
          [
            SETTINGS_KEYS.Timezone,
            normalized.timezone,
          ],
          [
            SETTINGS_KEYS.CurrencyCode,
            normalized.currencyCode,
          ],
          [
            SETTINGS_KEYS.DefaultPageSize,
            normalized.defaultPageSize,
          ],
          [
            SETTINGS_KEYS.AllowNegativeStock,
            normalized.allowNegativeStock,
          ],
          [
            SETTINGS_KEYS.StockCountConcurrencyPolicy,
            normalized.stockCountConcurrencyPolicy,
          ],
        ] as const) {
          await tx.systemSetting.upsert({
            where: { key },
            update: {
              value,
              updatedByUserId: userId,
            },
            create: {
              key,
              value,
              updatedByUserId: userId,
            },
          });
        }

        const after =
          await this.load(tx);

        await this.audit.recordInTransaction(
          tx,
          {
            userId,
            action:
              'settings.updated',
            entityType:
              'application-settings',
            before:
              this.auditSnapshot(
                before,
              ),
            after:
              this.auditSnapshot(
                after,
              ),
          },
        );

        return after;
      },
    );
  }

  async currencyCode(): Promise<string> {
    return this.stringValue(
      this.prisma,
      SETTINGS_KEYS.CurrencyCode,
      DEFAULT_APPLICATION_SETTINGS.currencyCode,
    );
  }

  async currencyCodeInTransaction(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    return this.stringValue(
      tx,
      SETTINGS_KEYS.CurrencyCode,
      DEFAULT_APPLICATION_SETTINGS.currencyCode,
    );
  }

  async allowNegativeStockInTransaction(
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    return this.booleanValue(
      tx,
      SETTINGS_KEYS.AllowNegativeStock,
      DEFAULT_APPLICATION_SETTINGS.allowNegativeStock,
    );
  }

  async stockCountConcurrencyPolicyInTransaction(
    tx: Prisma.TransactionClient,
  ): Promise<StockCountConcurrencyPolicy> {
    const value =
      await this.value(
        tx,
        SETTINGS_KEYS.StockCountConcurrencyPolicy,
      );

    return this.asPolicy(
      value,
      DEFAULT_APPLICATION_SETTINGS.stockCountConcurrencyPolicy,
    );
  }

  private async load(
    client: SettingsClient,
  ): Promise<SettingsSnapshot> {
    const rows =
      await client.systemSetting.findMany({
        where: {
          key: {
            in: SETTING_KEYS,
          },
        },
        include: {
          updatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

    const values = new Map(
      rows.map((row) => [
        row.key,
        row.value,
      ]),
    );
    const latest = rows[0];

    return {
      organizationName:
        this.asString(
          values.get(
            SETTINGS_KEYS.OrganizationName,
          ),
          DEFAULT_APPLICATION_SETTINGS.organizationName,
        ),
      timezone:
        this.asString(
          values.get(
            SETTINGS_KEYS.Timezone,
          ),
          DEFAULT_APPLICATION_SETTINGS.timezone,
        ),
      currencyCode:
        this.asString(
          values.get(
            SETTINGS_KEYS.CurrencyCode,
          ),
          DEFAULT_APPLICATION_SETTINGS.currencyCode,
        ).toUpperCase(),
      defaultPageSize:
        this.asInteger(
          values.get(
            SETTINGS_KEYS.DefaultPageSize,
          ),
          DEFAULT_APPLICATION_SETTINGS.defaultPageSize,
        ),
      allowNegativeStock:
        this.asBoolean(
          values.get(
            SETTINGS_KEYS.AllowNegativeStock,
          ),
          DEFAULT_APPLICATION_SETTINGS.allowNegativeStock,
        ),
      stockCountConcurrencyPolicy:
        this.asPolicy(
          values.get(
            SETTINGS_KEYS.StockCountConcurrencyPolicy,
          ),
          DEFAULT_APPLICATION_SETTINGS.stockCountConcurrencyPolicy,
        ),
      ...(latest
        ? {
            updatedAt:
              latest.updatedAt,
          }
        : {}),
      ...(latest?.updatedBy
        ? {
            updatedBy: {
              id:
                latest.updatedBy.id,
              name:
                (
                  latest.updatedBy
                    .firstName +
                  ' ' +
                  latest.updatedBy
                    .lastName
                ).trim(),
            },
          }
        : {}),
    };
  }

  private normalize(
    dto: UpdateSettingsDto,
  ) {
    const organizationName =
      dto.organizationName.trim();
    const timezone =
      dto.timezone.trim();
    const currencyCode =
      dto.currencyCode
        .trim()
        .toUpperCase();

    if (!organizationName) {
      throw new BadRequestException({
        code:
          'INVALID_ORGANIZATION_NAME',
        message:
          'Organization name is required',
        fields: {
          organizationName: [
            'Enter an organization name.',
          ],
        },
      });
    }

    if (
      !this.supportedTimezones().includes(
        timezone,
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_TIMEZONE',
        message:
          'Timezone is not supported',
        fields: {
          timezone: [
            'Select a supported timezone.',
          ],
        },
      });
    }

    if (
      !this.supportedCurrencies().includes(
        currencyCode,
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_CURRENCY',
        message:
          'Currency code is not supported',
        fields: {
          currencyCode: [
            'Select a supported currency.',
          ],
        },
      });
    }

    return {
      organizationName,
      timezone,
      currencyCode,
      defaultPageSize:
        dto.defaultPageSize,
      allowNegativeStock:
        dto.allowNegativeStock,
      stockCountConcurrencyPolicy:
        dto.stockCountConcurrencyPolicy,
    };
  }

  private supportedTimezones(): string[] {
    return [
      ...new Set([
        'UTC',
        ...Intl.supportedValuesOf(
          'timeZone',
        ),
      ]),
    ];
  }

  private supportedCurrencies(): string[] {
    return Intl.supportedValuesOf(
      'currency',
    );
  }

  private async value(
    client: SettingsClient,
    key: string,
  ): Promise<Prisma.JsonValue | undefined> {
    const setting =
      await client.systemSetting.findUnique({
        where: { key },
        select: { value: true },
      });

    return setting?.value;
  }

  private async stringValue(
    client: SettingsClient,
    key: string,
    fallback: string,
  ): Promise<string> {
    return this.asString(
      await this.value(client, key),
      fallback,
    );
  }

  private async booleanValue(
    client: SettingsClient,
    key: string,
    fallback: boolean,
  ): Promise<boolean> {
    return this.asBoolean(
      await this.value(client, key),
      fallback,
    );
  }

  private asString(
    value: Prisma.JsonValue | undefined,
    fallback: string,
  ): string {
    return typeof value === 'string' &&
      value.trim()
      ? value
      : fallback;
  }

  private asInteger(
    value: Prisma.JsonValue | undefined,
    fallback: number,
  ): number {
    return typeof value === 'number' &&
      Number.isInteger(value)
      ? value
      : fallback;
  }

  private asBoolean(
    value: Prisma.JsonValue | undefined,
    fallback: boolean,
  ): boolean {
    return typeof value === 'boolean'
      ? value
      : fallback;
  }

  private asPolicy(
    value: Prisma.JsonValue | undefined,
    fallback:
      StockCountConcurrencyPolicy,
  ): StockCountConcurrencyPolicy {
    return typeof value === 'string' &&
      (
        STOCK_COUNT_CONCURRENCY_POLICIES as readonly string[]
      ).includes(value)
      ? (value as StockCountConcurrencyPolicy)
      : fallback;
  }

  private auditSnapshot(
    settings: SettingsSnapshot,
  ) {
    return {
      organizationName:
        settings.organizationName,
      timezone: settings.timezone,
      currencyCode:
        settings.currencyCode,
      defaultPageSize:
        settings.defaultPageSize,
      allowNegativeStock:
        settings.allowNegativeStock,
      stockCountConcurrencyPolicy:
        settings.stockCountConcurrencyPolicy,
    };
  }
}
