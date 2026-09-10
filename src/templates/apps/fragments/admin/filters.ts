import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

function filtersContent(): string {
  return `"use client";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import type { useAdminUserFilters } from "../use-admin-user-filters";
import type { AdminUsersTranslate } from "../translations";

export type AdminUserFiltersProps = ReturnType<typeof useAdminUserFilters>;

export function AdminUserFilters({
  search,
  isFetching,
  form,
  translate,
  clear,
}: AdminUserFiltersProps): React.JSX.Element {

  return (
    <form.AppForm>
      <Form
        form={form}
        className="w-full"
      >
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,24rem)_1fr]">
        <FieldGroup className="contents">
          <form.AppField name="search">
            {(field) => (
              <field.TextField
                className="row-span-3 grid grid-rows-subgrid has-[[data-slot=field-error]]:row-span-4"
                type="search"
                label={translate("filters.label")}
                description={translate("filters.description")}
                placeholder={translate("filters.placeholder")}
                autoComplete="off"
              />
            )}
          </form.AppField>
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-2 sm:col-start-2 sm:row-start-2 sm:self-start">
          <form.SubmitButton variant="outline" pendingLabel={translate("filters.searching")}>
            {translate("filters.search")}
          </form.SubmitButton>
          {search ? (
            <Button
              type="button"
              variant="ghost"
              onClick={clear}
            >
              {translate("filters.clear")}
            </Button>
          ) : null}
          <span className="sr-only" role="status" aria-live="polite">
            {isFetching ? translate("filters.updating") : ""}
          </span>
        </div>
        </div>
      </Form>
    </form.AppForm>
  );
}

export interface AdminUsersPaginationProps {
  translate: AdminUsersTranslate;
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
  translate,
}: AdminUsersPaginationProps): React.JSX.Element {
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
