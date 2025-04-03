"use client"

import type React from "react"

import { FileExplorer } from "@/components/file-explorer"
import { ContentViewer } from "@/components/content-viewer"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { X } from "lucide-react"
import { VerticalResizable } from "@/components/vertical-resizable"

interface Tab {
  id: string
  title: string
  type: "file" | "chart"
  content: string
  repoName?: string
  path?: string
}

interface RepositoryPanelProps {
  repoName: string
  fileStructure: any[]
  tabs: Tab[]
  activeTab: string | null
  onFileSelect: (repo: string, path: string) => void
  onTabChange: (tabId: string) => void
  onTabClose: (tabId: string, e: React.MouseEvent) => void
}

export function RepositoryPanel({
  repoName,
  fileStructure,
  tabs,
  activeTab,
  onFileSelect,
  onTabChange,
  onTabClose,
}: RepositoryPanelProps) {
  return (
    <VerticalResizable
      topPanel={<FileExplorer repoName={repoName} fileStructure={fileStructure} onFileSelect={onFileSelect} />}
      bottomPanel={
        <Tabs value={activeTab || ""} onValueChange={onTabChange} className="flex flex-col h-full">
          <div className="border-b bg-background z-10 sticky top-0">
            <TabsList className="flex overflow-x-auto w-full h-auto py-1">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-1 min-w-max">
                  {tab.title}
                  <button className="ml-1 rounded-full hover:bg-muted p-0.5" onClick={(e) => onTabClose(tab.id, e)}>
                    <X size={14} />
                  </button>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto relative">
            {/* Tab Contents */}
            {tabs.map((tab) => (
              <TabsContent key={tab.id} value={tab.id} className="p-0 mt-0 h-full absolute inset-0">
                <ContentViewer type={tab.type} content={tab.content} filePath={tab.path} />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      }
      defaultTopHeight={40}
      minTopHeight={15}
      minBottomHeight={15}
    />
  )
}

