"use client";

import {
  ColumnDef,
  RowData,
  flexRender,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

// TanStack Table v9: the core row model is built in; these tables need no extra features.
export const dataTableFeatures = tableFeatures({});
export type DataTableFeatures = typeof dataTableFeatures;

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  onRowClick?:(row:TData) => void;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  onRowClick,
}: DataTableProps<TData>) {
  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
  });

    return (
    <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
        <TableBody>
            {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
                <TableRow
                onClick={() => onRowClick?.(row.original)}
                key={row.id}
                    className="cursor-pointer"
                >
                    {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className="text-sm p-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                    ))}
                    </TableRow>
                    ))
            ) : (
                <TableRow>
                <TableCell colSpan={columns.length} className="h-19 text-center text-muted-foreground">
                    No results.
                </TableCell>
                </TableRow>
            )}
            </TableBody>
        </Table>
        </div>
    );
    }
