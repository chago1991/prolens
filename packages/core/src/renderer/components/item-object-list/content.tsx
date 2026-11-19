/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./item-list-layout.scss";

import { Spinner } from "@freelensapp/spinner";
import { cssNames, isDefined, isReactNode, noop, prevDefault, stopPropagation } from "@freelensapp/utilities";
import { withInjectables } from "@ogre-tools/injectable-react";
import autoBindReact from "auto-bind/react";
import { action, observable, observableRef } from "mobx";
import { Observer, observer } from "mobx-react";
import React from "react";
import isTableColumnHiddenInjectable from "../../../features/user-preferences/common/is-table-column-hidden.injectable";
import toggleTableColumnVisibilityInjectable from "../../../features/user-preferences/common/toggle-table-column-visibility.injectable";
import activeThemeInjectable from "../../themes/active.injectable";
import { AddRemoveButtons } from "../add-remove-buttons";
import { Checkbox } from "../checkbox";
import openConfirmDialogInjectable from "../confirm-dialog/open.injectable";
import { MenuItem } from "../menu";
import { MenuActions } from "../menu/menu-actions";
import { NoItems } from "../no-items";
import { Table, TableCell, TableHead, TableRow } from "../table";
import { effectiveColumnOrder, isCustomColumnOrder, moveColumn } from "./column-order";
import columnOrderStorageInjectable from "./column-order-storage/storage.injectable";
import columnResizeStorageInjectable from "./column-resize-storage/storage.injectable";
import pageFiltersStoreInjectable from "./page-filters/store.injectable";

import type { ItemObject, TableCellProps } from "@freelensapp/list-layout";
import type { IClassName, StrictReactNode } from "@freelensapp/utilities";

import type { IComputedValue } from "mobx";

import type { IsTableColumnHidden } from "../../../features/user-preferences/common/is-table-column-hidden.injectable";
import type { ToggleTableColumnVisibility } from "../../../features/user-preferences/common/toggle-table-column-visibility.injectable";
import type { LensTheme } from "../../themes/lens-theme";
import type { StorageLayer } from "../../utils/storage-helper";
import type { AddRemoveButtonsProps } from "../add-remove-buttons";
import type { ConfirmDialogParams } from "../confirm-dialog";
import type { OpenConfirmDialog } from "../confirm-dialog/open.injectable";
import type { TableProps, TableRowProps, TableSortCallbacks } from "../table";
import type { ColumnOrderStorageState } from "./column-order-storage/storage.injectable";
import type { ColumnResizeStorageState } from "./column-resize-storage/storage.injectable";
import type { ItemListStore } from "./list-layout";
import type { Filter, PageFiltersStore } from "./page-filters/store";

interface ResizeState {
  columnId: string;
  startX: number;
  tableWidth: number;
  initialFlexGrowValues: Map<string, number>;
  initialColumnRight: number;
}

export interface ItemListLayoutContentProps<Item extends ItemObject, PreLoadStores extends boolean> {
  getFilters: () => Filter[];
  tableId?: string;
  className: IClassName;
  getItems: () => Item[];
  store: ItemListStore<Item, PreLoadStores>;
  getIsReady: () => boolean; // show loading indicator while not ready
  isSelectable?: boolean; // show checkbox in rows for selecting items
  isConfigurable?: boolean;
  copyClassNameFromHeadCells?: boolean;
  sortingCallbacks?: TableSortCallbacks<Item>;
  tableProps?: Partial<TableProps<Item>>; // low-level table configuration
  renderTableHeader?: (TableCellProps | undefined | null)[];
  renderTableContents: (item: Item) => (StrictReactNode | TableCellProps)[];
  renderItemMenu?: (item: Item, store: ItemListStore<Item, PreLoadStores>) => StrictReactNode;
  customizeTableRowProps?: (item: Item) => Partial<TableRowProps<Item>>;
  addRemoveButtons?: Partial<AddRemoveButtonsProps>;
  virtual?: boolean;

  // item details view
  hasDetailsView?: boolean;
  detailsItem?: Item;
  onDetails?: (item: Item) => void;

  // other
  customizeRemoveDialog?: (selectedItems: Item[]) => Partial<ConfirmDialogParams>;

  spinnerTestId?: string;

  /**
   * Message to display when a store failed to load
   *
   * @default "Failed to load items"
   */
  failedToLoadMessage?: StrictReactNode;
}

interface Dependencies {
  activeTheme: IComputedValue<LensTheme>;
  pageFiltersStore: PageFiltersStore;
  openConfirmDialog: OpenConfirmDialog;
  toggleTableColumnVisibility: ToggleTableColumnVisibility;
  isTableColumnHidden: IsTableColumnHidden;
  columnResizeStorage: StorageLayer<ColumnResizeStorageState>;
  columnOrderStorage: StorageLayer<ColumnOrderStorageState>;
}

interface ColumnDrag {
  readonly columnId: string;
  readonly targetId?: string;
  readonly placement?: "before" | "after";
}

/** The flex order of the row menu cell: after every column. */
const lastColumnOrder = 100_000;

/** The key a header cell is ordered by: its id, or its position for a cell without one. */
const columnKeyOf = (cell: TableCellProps | null | undefined, index: number) => cell?.id ?? `#${index}`;

@observer
export class NonInjectedItemListLayoutContent<
  Item extends ItemObject,
  PreLoadStores extends boolean,
> extends React.Component<ItemListLayoutContentProps<Item, PreLoadStores> & Dependencies> {
  private resizeState: ResizeState | null = null;
  private tableRef = React.createRef<HTMLDivElement>();
  private resizeGuideRef = React.createRef<HTMLDivElement>();

  @observable private accessor columnFlexGrow = new Map<string, number>();
  @observable private accessor resizeGuideX: number | null = null;
  @observable private accessor savedColumnOrder: string[] | undefined = undefined;
  @observable private accessor columnDrag: ColumnDrag | null = null;

  // mobx-react 9 forbids reading this.props inside a derivation. getRow/getTableRow
  // (and the showColumn they call) are invoked from foreign derivations — the inner
  // <Observer> render prop and the <Table> row renderer — so they read props from
  // this observable snapshot, refreshed on every update, instead of this.props.
  @observableRef private accessor observableProps: Readonly<
    ItemListLayoutContentProps<Item, PreLoadStores> & Dependencies
  >;

  constructor(props: ItemListLayoutContentProps<Item, PreLoadStores> & Dependencies) {
    super(props);
    this.observableProps = props;
    autoBindReact(this);
    this.loadSavedColumnWidths();
    this.savedColumnOrder = props.tableId ? props.columnOrderStorage.get()[props.tableId] : undefined;
  }

  /**
   * The flex `order` of each column, by its key. Header and row cells are
   * laid out by the same orders, so that a reordered column stays aligned
   * without the cells being rendered in another order.
   */
  private columnOrders(renderTableHeader: ItemListLayoutContentProps<Item, PreLoadStores>["renderTableHeader"]) {
    const defaults = (renderTableHeader ?? []).map((cell, index) => columnKeyOf(cell, index));
    const order = effectiveColumnOrder(this.savedColumnOrder, defaults);

    return { defaults, order, positions: new Map(order.map((key, index) => [key, index + 1])) };
  }

  @action
  private saveColumnOrder(order: string[] | undefined) {
    const { tableId, columnOrderStorage } = this.props;

    this.savedColumnOrder = order;

    if (!tableId) return;

    const state = { ...columnOrderStorage.get() };

    if (order) state[tableId] = order;
    else delete state[tableId];

    columnOrderStorage.set(state);
  }

  private columnDragProps(columnId: string) {
    const drag = this.columnDrag;

    return {
      draggable: true,
      className: cssNames({
        columnDragging: drag?.columnId === columnId,
        columnDropBefore: drag?.targetId === columnId && drag.placement === "before",
        columnDropAfter: drag?.targetId === columnId && drag.placement === "after",
      }),
      onDragStart: action((event: React.DragEvent<HTMLDivElement>) => {
        if (this.resizeState || (event.target as HTMLElement).classList?.contains("resize-handle")) {
          event.preventDefault();

          return;
        }

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", columnId);
        this.columnDrag = { columnId };
      }),
      onDragOver: action((event: React.DragEvent<HTMLDivElement>) => {
        const current = this.columnDrag;

        if (!current || current.columnId === columnId) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";

        const box = event.currentTarget.getBoundingClientRect();
        const placement = event.clientX < box.left + box.width / 2 ? "before" : "after";

        if (current.targetId !== columnId || current.placement !== placement) {
          this.columnDrag = { columnId: current.columnId, targetId: columnId, placement };
        }
      }),
      onDrop: action((event: React.DragEvent<HTMLDivElement>) => {
        const current = this.columnDrag;

        event.preventDefault();
        this.columnDrag = null;

        if (!current?.targetId || !current.placement) return;

        const { order } = this.columnOrders(this.props.renderTableHeader);

        this.saveColumnOrder(moveColumn(order, current.columnId, current.targetId, current.placement));
      }),
      onDragEnd: action(() => {
        this.columnDrag = null;
      }),
    };
  }

  componentDidUpdate() {
    this.observableProps = this.props;
  }

  componentWillUnmount() {
    this.cleanupResizeListeners();
  }

  @action
  private loadSavedColumnWidths() {
    const { tableId, columnResizeStorage } = this.props;
    if (!tableId) return;

    const savedState = columnResizeStorage.get();
    const tableState = savedState[tableId];

    if (tableState) {
      Object.entries(tableState).forEach(([columnId, flexGrow]) => {
        this.columnFlexGrow.set(columnId, flexGrow);
      });
    }
  }

  @action
  private handleResizeReset(columnId: string) {
    const { tableId, columnResizeStorage } = this.props;

    this.columnFlexGrow.delete(columnId);

    if (tableId) {
      const savedState = columnResizeStorage.get();
      const tableState = savedState[tableId] || {};
      delete tableState[columnId];
      columnResizeStorage.merge({ [tableId]: tableState });
    }
  }

  private handleResizeStart(columnId: string, event: MouseEvent) {
    const tableElement = this.tableRef.current;
    if (!tableElement) return;

    const headers = this.getVisibleHeaders();
    const initialFlexGrowValues = new Map<string, number>();
    headers.forEach((header) => {
      if (header.id) {
        initialFlexGrowValues.set(header.id, this.getColumnFlexGrow(header));
      }
    });

    const headerCell = tableElement.querySelector(`.TableHead .TableCell[id="${columnId}"]`) as HTMLElement;

    if (!headerCell) return;

    const tableRect = tableElement.getBoundingClientRect();
    const headerRect = headerCell.getBoundingClientRect();
    const initialColumnRight = headerRect.right - tableRect.left;

    this.resizeState = {
      columnId,
      startX: event.clientX,
      tableWidth: tableElement.offsetWidth,
      initialFlexGrowValues,
      initialColumnRight,
    };

    this.resizeGuideX = initialColumnRight;

    document.addEventListener("mousemove", this.handleResizeMove);
    document.addEventListener("mouseup", this.handleResizeEnd);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  @action
  private handleResizeMove(event: MouseEvent) {
    if (!this.resizeState) return;

    const { columnId, startX, tableWidth, initialFlexGrowValues } = this.resizeState;
    const deltaX = event.clientX - startX;

    const headers = this.getVisibleHeaders();
    const totalInitialFlexGrow = Array.from(initialFlexGrowValues.values()).reduce((sum, val) => sum + val, 0);
    const pixelsPerFlexUnit = tableWidth / totalInitialFlexGrow;
    const deltaFlexGrow = deltaX / pixelsPerFlexUnit;

    const initialCurrentFlexGrow = initialFlexGrowValues.get(columnId);
    if (!initialCurrentFlexGrow) return;

    const newCurrentFlexGrow = Math.max(0.3, initialCurrentFlexGrow + deltaFlexGrow);
    this.columnFlexGrow.set(columnId, newCurrentFlexGrow);

    requestAnimationFrame(() => {
      const tableElement = this.tableRef.current;
      if (tableElement) {
        const headerCell = tableElement.querySelector(`.TableHead .TableCell[id="${columnId}"]`) as HTMLElement;
        if (headerCell) {
          const tableRect = tableElement.getBoundingClientRect();
          const headerRect = headerCell.getBoundingClientRect();
          const actualColumnRight = headerRect.right - tableRect.left;

          this.resizeGuideX = actualColumnRight;
        }
      }
    });

    const otherColumns = headers.filter((h) => h.id && h.id !== columnId);
    const totalOtherInitialFlexGrow = otherColumns.reduce((sum, h) => sum + (initialFlexGrowValues.get(h.id!) || 0), 0);

    if (totalOtherInitialFlexGrow > 0) {
      otherColumns.forEach((col) => {
        if (!col.id) return;
        const initialFlexGrow = initialFlexGrowValues.get(col.id) || 0;
        const proportion = initialFlexGrow / totalOtherInitialFlexGrow;
        const adjustment = deltaFlexGrow * proportion;
        const newFlexGrow = Math.max(0.3, initialFlexGrow - adjustment);
        this.columnFlexGrow.set(col.id, newFlexGrow);
      });
    }
  }

  @action
  private handleResizeEnd() {
    const { tableId, columnResizeStorage } = this.props;

    if (tableId && this.resizeState) {
      const savedState = columnResizeStorage.get();
      const tableState = savedState[tableId] || {};

      this.columnFlexGrow.forEach((flexGrow, columnId) => {
        tableState[columnId] = Math.round(flexGrow * 100) / 100;
      });

      columnResizeStorage.merge({ [tableId]: tableState });
    }

    this.cleanupResizeListeners();
    this.resizeState = null;
    this.resizeGuideX = null;
  }

  private cleanupResizeListeners() {
    document.removeEventListener("mousemove", this.handleResizeMove);
    document.removeEventListener("mouseup", this.handleResizeEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  private getVisibleHeaders(): (TableCellProps & { id: string })[] {
    const { renderTableHeader = [] } = this.props;
    const nonResizableIds = new Set(["checkbox", "logs", "menu"]);

    return renderTableHeader
      .filter(isDefined)
      .filter((h) => this.showColumn(h))
      .filter((h): h is TableCellProps & { id: string } => !!h.id && !nonResizableIds.has(h.id));
  }

  private getColumnFlexGrow(header: TableCellProps): number {
    if (header.id && this.columnFlexGrow.has(header.id)) {
      return this.columnFlexGrow.get(header.id)!;
    }
    return this.getDefaultFlexGrow(header);
  }

  private getDefaultFlexGrow(header: TableCellProps): number {
    if (!header.id || !this.tableRef.current) return 1;

    const headerCell = this.tableRef.current.querySelector(`.TableHead .TableCell[id="${header.id}"]`) as HTMLElement;

    if (!headerCell) return 1;

    const computedStyle = window.getComputedStyle(headerCell);
    const flexGrow = computedStyle.flexGrow;

    return flexGrow ? parseFloat(flexGrow) : 1;
  }

  // Plain getter (not @computed): reads this.props, which mobx-react 9 forbids
  // inside a derivation. Read from render, reactivity is preserved by the
  // observer render reaction.
  get failedToLoad() {
    return this.props.store.failedLoading;
  }

  renderRow(item: Item) {
    return this.getTableRow(item);
  }

  getTableRow(item: Item) {
    // Read from observableProps: this method is called from the <Table> row
    // renderer and the <Observer> below, which are derivations other than this
    // component's own render, where mobx-react 9 forbids reading this.props.
    const {
      isSelectable,
      renderTableHeader,
      renderTableContents,
      renderItemMenu,
      store,
      hasDetailsView,
      onDetails,
      copyClassNameFromHeadCells,
      customizeTableRowProps = () => ({}),
      detailsItem,
      tableId,
      isConfigurable,
      isTableColumnHidden,
    } = this.observableProps;
    const { isSelected } = store;

    // Inline column-visibility check from the captured snapshot; this.showColumn
    // reads this.props, which is forbidden here (foreign derivation).
    const isColumnShown = ({ id: columnId, showWithColumn }: TableCellProps) =>
      !isConfigurable || !tableId || !isTableColumnHidden(tableId, columnId, showWithColumn);
    const { positions } = this.columnOrders(renderTableHeader);

    // The key matters for a non-virtual list, where <Table> renders these rows
    // as a list; the virtual one wraps each in a keyed <div> (getRow).
    return (
      <TableRow
        key={item.getId()}
        nowrap
        searchItem={item}
        sortItem={item}
        selected={detailsItem && detailsItem.getId() === item.getId()}
        onClick={hasDetailsView ? prevDefault(() => onDetails?.(item)) : undefined}
        {...customizeTableRowProps(item)}
      >
        {isSelectable && (
          <TableCell checkbox isChecked={isSelected(item)} onClick={prevDefault(() => store.toggleSelection(item))} />
        )}
        {renderTableContents(item).map((content, index) => {
          const cellProps: TableCellProps = isReactNode(content) ? { children: content } : content;
          const headCell = renderTableHeader?.[index];

          if (copyClassNameFromHeadCells && headCell) {
            cellProps.className = cssNames(cellProps.className, headCell.className);
          }

          if (!headCell || isColumnShown(headCell)) {
            return (
              <TableCell
                key={index}
                {...cellProps}
                style={{
                  ...cellProps.style,
                  order: positions.get(columnKeyOf(headCell, index)) ?? cellProps.style?.order,
                  flex:
                    headCell?.id && this.columnFlexGrow.has(headCell.id)
                      ? `${this.columnFlexGrow.get(headCell.id)} 0`
                      : cellProps.style?.flex,
                }}
              />
            );
          }

          return null;
        })}
        {renderItemMenu && (
          <TableCell className="menu" style={{ order: lastColumnOrder }}>
            <div onClick={stopPropagation}>{renderItemMenu(item, store)}</div>
          </TableCell>
        )}
      </TableRow>
    );
  }

  getRow(uid: string) {
    return (
      <div key={uid}>
        <Observer>
          {() => {
            // observableProps, not this.props: this <Observer> is its own derivation.
            const item = this.observableProps.getItems().find((item) => item.getId() === uid);

            if (!item) return null;

            return this.getTableRow(item);
          }}
        </Observer>
      </div>
    );
  }

  removeItemsDialog(selectedItems: Item[]) {
    const { customizeRemoveDialog, store, openConfirmDialog } = this.props;
    const visibleMaxNamesCount = 5;
    const selectedNames = selectedItems
      .map((ns) => ns.getName())
      .slice(0, visibleMaxNamesCount)
      .join(", ");
    const dialogCustomProps = customizeRemoveDialog ? customizeRemoveDialog(selectedItems) : {};
    const selectedCount = selectedItems.length;
    const tailCount = selectedCount > visibleMaxNamesCount ? selectedCount - visibleMaxNamesCount : 0;
    const tail =
      tailCount > 0 ? (
        <>
          {", and "}
          <b>{tailCount}</b>
          {" more"}
        </>
      ) : null;
    const message =
      selectedCount <= 1 ? (
        <p>
          {"Remove item "}
          <b>{selectedNames}</b>?
        </p>
      ) : (
        <p>
          {"Remove "}
          <b>{selectedCount}</b>
          {" items "}
          <b>{selectedNames}</b>
          {tail}?
        </p>
      );
    const { removeSelectedItems, removeItems } = store;
    const onConfirm =
      typeof removeItems === "function"
        ? () => removeItems.apply(store, [selectedItems])
        : typeof removeSelectedItems === "function"
          ? removeSelectedItems.bind(store)
          : noop;

    openConfirmDialog({
      ok: onConfirm,
      labelOk: "Remove",
      message,
      ...dialogCustomProps,
    });
  }

  renderNoItems() {
    if (this.failedToLoad) {
      return <NoItems>{this.props.failedToLoadMessage}</NoItems>;
    }

    if (!this.props.getIsReady()) {
      return <Spinner center data-testid={this.props.spinnerTestId} />;
    }

    if (this.props.getFilters().length > 0) {
      return (
        <NoItems>
          No items found.
          <p>
            <a onClick={() => this.props.pageFiltersStore.reset()} className="contrast">
              Reset filters?
            </a>
          </p>
        </NoItems>
      );
    }

    return <NoItems />;
  }

  renderItems() {
    if (this.props.virtual) {
      return null;
    }

    return this.props.getItems().map((item) => this.getRow(item.getId()));
  }

  renderTableHeader() {
    const { customizeTableRowProps, renderTableHeader, isSelectable, isConfigurable, store, tableId } = this.props;

    if (!renderTableHeader) {
      return null;
    }

    const enabledItems = this.props.getItems().filter((item) => !customizeTableRowProps?.(item).disabled);
    const { positions } = this.columnOrders(renderTableHeader);

    return (
      <TableHead showTopLine nowrap>
        {isSelectable && (
          <Observer>
            {() => (
              <TableCell
                checkbox
                isChecked={store.isSelectedAll(enabledItems)}
                onClick={prevDefault(() => store.toggleSelectionAll(enabledItems))}
              />
            )}
          </Observer>
        )}
        {renderTableHeader.map((cellProps, index) => {
          if (!cellProps || !this.showColumn(cellProps)) return null;

          const dragProps = cellProps.id ? this.columnDragProps(cellProps.id) : undefined;

          return (
            <TableCell
              key={cellProps.id ?? index}
              onResizeStart={cellProps.id ? (event) => this.handleResizeStart(cellProps.id!, event) : undefined}
              onResizeReset={cellProps.id ? () => this.handleResizeReset(cellProps.id!) : undefined}
              {...dragProps}
              {...cellProps}
              className={cssNames(cellProps.className, dragProps?.className)}
              resizable={cellProps.id !== "logs" && !!cellProps.id}
              style={{
                ...cellProps.style,
                order: positions.get(columnKeyOf(cellProps, index)) ?? cellProps.style?.order,
                flex:
                  cellProps.id && this.columnFlexGrow.has(cellProps.id)
                    ? `${this.columnFlexGrow.get(cellProps.id)} 0`
                    : cellProps.style?.flex,
              }}
            />
          );
        })}
        <TableCell className="menu" style={{ order: lastColumnOrder }}>
          {isConfigurable && tableId ? this.renderColumnVisibilityMenu(tableId) : undefined}
        </TableCell>
      </TableHead>
    );
  }

  render() {
    const {
      store,
      hasDetailsView,
      addRemoveButtons = {},
      virtual,
      sortingCallbacks,
      detailsItem,
      className,
      tableProps = {},
      tableId,
      getItems,
      activeTheme,
    } = this.props;
    const selectedItemId = detailsItem && detailsItem.getId();
    const classNames = cssNames(className, "grow", "shrink-0", "basis-0", activeTheme.get().type);
    const items = getItems();
    const selectedItems = store.pickOnlySelected(items);

    return (
      <div className="items grow shrink-0 basis-0 flex flex-col" ref={this.tableRef}>
        {this.resizeGuideX !== null && (
          <div
            ref={this.resizeGuideRef}
            className="resize-guide"
            style={{ right: `calc(100% - ${this.resizeGuideX}px)` }}
          />
        )}
        <Table
          tableId={tableId}
          virtual={virtual}
          selectable={hasDetailsView}
          sortable={sortingCallbacks}
          getTableRow={this.getRow}
          renderRow={virtual ? undefined : this.renderRow}
          items={items}
          selectedItemId={selectedItemId}
          noItems={this.renderNoItems()}
          className={classNames}
          {...tableProps}
        >
          {this.renderTableHeader()}
          {this.renderItems()}
        </Table>

        <Observer>
          {() => (
            <AddRemoveButtons
              onRemove={
                (store.removeItems || store.removeSelectedItems) && selectedItems.length > 0
                  ? () => this.removeItemsDialog(selectedItems)
                  : undefined
              }
              removeTooltip={`Remove selected items (${selectedItems.length})`}
              {...addRemoveButtons}
            />
          )}
        </Observer>
      </div>
    );
  }

  showColumn({ id: columnId, showWithColumn }: TableCellProps): boolean {
    const { tableId, isConfigurable } = this.props;

    return !isConfigurable || !tableId || !this.props.isTableColumnHidden(tableId, columnId, showWithColumn);
  }

  renderResetColumnOrder() {
    const { defaults, order } = this.columnOrders(this.props.renderTableHeader);

    if (!isCustomColumnOrder(order, defaults)) return null;

    return (
      <MenuItem key="reset-column-order" onClick={() => this.saveColumnOrder(undefined)}>
        Reset column order
      </MenuItem>
    );
  }

  renderColumnVisibilityMenu(tableId: string) {
    const { renderTableHeader = [] } = this.props;

    return (
      <MenuActions
        id="menu-actions-for-item-object-list-content"
        className="ItemListLayoutVisibilityMenu"
        toolbar={false}
        autoCloseOnSelect={false}
      >
        {renderTableHeader
          .filter(isDefined)
          .filter((props): props is TableCellProps & { id: string } => !!props.id)
          .filter((props) => !props.showWithColumn)
          .map((cellProps) => (
            <MenuItem key={cellProps.id} className="input">
              <Checkbox
                label={cellProps.title ?? `<${cellProps.className}>`}
                value={this.showColumn(cellProps)}
                onChange={() => this.props.toggleTableColumnVisibility(tableId, cellProps.id)}
              />
            </MenuItem>
          ))}
        {this.renderResetColumnOrder()}
      </MenuActions>
    );
  }
}

export const ItemListLayoutContent = withInjectables<Dependencies, ItemListLayoutContentProps<ItemObject, boolean>>(
  NonInjectedItemListLayoutContent,
  {
    getProps: (di, props) => ({
      ...props,
      activeTheme: di.inject(activeThemeInjectable),
      pageFiltersStore: di.inject(pageFiltersStoreInjectable),
      openConfirmDialog: di.inject(openConfirmDialogInjectable),
      toggleTableColumnVisibility: di.inject(toggleTableColumnVisibilityInjectable),
      isTableColumnHidden: di.inject(isTableColumnHiddenInjectable),
      columnResizeStorage: di.inject(columnResizeStorageInjectable),
      columnOrderStorage: di.inject(columnOrderStorageInjectable),
    }),
  },
) as <Item extends ItemObject, PreLoadStores extends boolean>(
  props: ItemListLayoutContentProps<Item, PreLoadStores>,
) => React.ReactElement;
