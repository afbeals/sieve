import type { CSSProperties, ReactNode } from 'react'
import { forwardRef, useImperativeHandle } from 'react'

// react-virtuoso virtualizes by measuring real layout (ResizeObserver + getBoundingClientRect),
// which jsdom doesn't provide - polyfilling that measurement protocol well enough to get real
// rows rendered turned out to be more fragile than it's worth for a test suite. Standard
// practice for testing code built on a virtualized-list library: replace it in tests with a
// plain, unvirtualized renderer that honors the same prop contract (data/itemContent/
// groupCounts/groupContent/components), so every row/item actually exists in the DOM and the
// app's own logic (selection, sort, filter, delete, ...) gets exercised for real. The real
// virtualization behavior itself isn't testable this way and isn't what these tests are for.

const noopHandle = { scrollToIndex: () => {} }

interface MockTableVirtuosoProps<T> {
  data: T[]
  itemContent: (index: number, item: T) => ReactNode
  fixedHeaderContent?: () => ReactNode
  components?: { Table?: React.ComponentType<{ style?: CSSProperties; children?: ReactNode }> }
  style?: CSSProperties
  endReached?: (index: number) => void
}

export const TableVirtuoso = forwardRef(function TableVirtuoso<T>(
  { data, itemContent, fixedHeaderContent, components, style }: MockTableVirtuosoProps<T>,
  ref: React.Ref<typeof noopHandle>
) {
  useImperativeHandle(ref, () => noopHandle)
  const Table = components?.Table ?? 'table'
  return (
    <Table style={style}>
      <thead>{fixedHeaderContent?.()}</thead>
      <tbody data-testid="mock-virtuoso-tbody">
        {data.map((item, index) => (
          <tr key={index}>{itemContent(index, item)}</tr>
        ))}
      </tbody>
    </Table>
  )
}) as <T>(props: MockTableVirtuosoProps<T> & { ref?: React.Ref<typeof noopHandle> }) => React.JSX.Element

interface MockGroupedVirtuosoProps {
  groupCounts: number[]
  groupContent: (groupIndex: number) => ReactNode
  itemContent: (index: number) => ReactNode
  style?: CSSProperties
  endReached?: (index: number) => void
}

export const GroupedVirtuoso = forwardRef(function GroupedVirtuoso(
  { groupCounts, groupContent, itemContent, style }: MockGroupedVirtuosoProps,
  ref: React.Ref<typeof noopHandle>
) {
  useImperativeHandle(ref, () => noopHandle)
  const elements: ReactNode[] = []
  let flatIndex = 0
  groupCounts.forEach((count, groupIndex) => {
    elements.push(<div key={`group-${groupIndex}`}>{groupContent(groupIndex)}</div>)
    for (let i = 0; i < count; i += 1) {
      elements.push(<div key={`item-${flatIndex}`}>{itemContent(flatIndex)}</div>)
      flatIndex += 1
    }
  })
  return <div style={style}>{elements}</div>
})

interface MockVirtuosoGridProps<T> {
  data: T[]
  itemContent: (index: number, item: T) => ReactNode
  components?: {
    List?: React.ComponentType<{ children?: ReactNode; className?: string }>
    Item?: React.ComponentType<{ children?: ReactNode; className?: string; style?: CSSProperties; 'data-index': number }>
  }
  listClassName?: string
  itemClassName?: string
  style?: CSSProperties
  endReached?: (index: number) => void
}

export const VirtuosoGrid = forwardRef(function VirtuosoGrid<T>(
  { data, itemContent, components, listClassName, itemClassName, style }: MockVirtuosoGridProps<T>,
  ref: React.Ref<typeof noopHandle>
) {
  useImperativeHandle(ref, () => noopHandle)
  const List = components?.List ?? 'div'
  const Item = components?.Item ?? 'div'
  return (
    <List style={style} className={listClassName}>
      {data.map((item, index) => (
        <Item key={index} className={itemClassName} data-index={index}>
          {itemContent(index, item)}
        </Item>
      ))}
    </List>
  )
}) as <T>(props: MockVirtuosoGridProps<T> & { ref?: React.Ref<typeof noopHandle> }) => React.JSX.Element
