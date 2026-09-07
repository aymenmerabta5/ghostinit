import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

function filtersContent(): string {
  return `"use client";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { adminUsersFilterSchema } from "../schema";
import { useAdminUsersTranslations } from "../translations";
import type { AdminUsersFilterInput } from "../types";

export interface AdminUserFiltersProps {
  search: string;
  isFetching: boolean;
  onApply(input: AdminUsersFilterInput): void;
  onClear(): void;
}

export function AdminUserFilters({
  search,
  isFetching,
  onApply,
  onClear,
}: AdminUserFiltersProps): React.JSX.Element {
  const translate = useAdminUsersTranslations();
  const form = useAppForm({
    defaultValues: { search },
    validators: { onSubmit: adminUsersFilterSchema(translate) },
    onSubmit: ({ value }) => onApply(value),
  });

  return (
    <form.AppForm>
      <Form
        form={form}
        className="flex w-full flex-col gap-3 sm:flex-row sm:items-end"
      >
        <FieldGroup className="w-full sm:max-w-sm">
          <form.AppField name="search">
            {(field) => (
              <field.TextField
                type="search"
                label={translate("filters.label")}
                description={translate("filters.description")}
                placeholder={translate("filters.placeholder")}
                autoComplete="off"
              />
            )}
          </form.AppField>
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-2">
          <form.SubmitButton variant="outline" pendingLabel={translate("filters.searching")}>
            {translate("filters.search")}
          </form.SubmitButton>
          {search ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                form.setFieldValue("search", "");
                onClear();
              }}
            >
              {translate("filters.clear")}
            </Button>
          ) : null}
          <span className="sr-only" role="status" aria-live="polite">
            {isFetching ? translate("filters.updating") : ""}
          </span>
        </div>
      </Form>
    </form.AppForm>
  );
}

export interface AdminUsersPaginationProps {
  page: number;
  totalPages: number;
  hasMore: boolean;
  isFetching: boolean;
  onPrevious(): void;
  onNext(): void;
}

export function AdminUsersPagination({
  page,
  totalPages,
  hasMore,
  isFetching,
  onPrevious,
  onNext,
}: AdminUsersPaginationProps): React.JSX.Element {
  const translate = useAdminUsersTranslations();
  const canGoNext = page < totalPages || hasMore;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-4" aria-label={translate("pagination.label")}>
      <p className="text-xs text-muted-foreground">
        {translate("pagination.position", { page, totalPages })}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page <= 1 || isFetching} onClick={onPrevious}>
          {translate("pagination.previous")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!canGoNext || isFetching} onClick={onNext}>
          {translate("pagination.next")}
        </Button>
      </div>
    </nav>
  );
}
`;
}

export function adminFiltersFile(options: AdminTemplateOptions): TemplateFile {
  return file(`${adminFeatureRoot(options)}/components/filters.tsx`, filtersContent());
}
