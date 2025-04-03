"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { ChatInterface } from "@/components/chat-interface"
import { RepositoryPanel } from "@/components/repository-panel"
import { useMobile } from "@/hooks/use-mobile"
import { ChevronLeft, ChevronRight, Bot, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface Tab {
  id: string
  title: string
  type: "file" | "chart"
  content: string
  repoName?: string
  path?: string
}

export default function GitHubAIPage() {
  const [currentRepo, setCurrentRepo] = useState("")
  const [fileStructure, setFileStructure] = useState<any[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [currentFiles, setCurrentFiles] = useState<string[]>([])
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [hasMessages, setHasMessages] = useState(false)
  const isMobile = useMobile()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<{ id: string; role: string; content: string }[]>([])

  // Handle file selection from FileExplorer
  const handleFileSelect = async (repo: string, path: string) => {
    // Try to find if we already have this file open
    const existingTabId = tabs.find((t) => t.type === "file" && t.repoName === repo && t.path === path)?.id

    if (existingTabId) {
      setActiveTab(existingTabId)
      return
    }

    // Create a new tab for this file with loading state
    const newTabId = `file-${Date.now()}`
    const fileTab: Tab = {
      id: newTabId,
      title: path.split("/").pop() || path,
      type: "file",
      content: "Loading...",
      repoName: repo,
      path: path,
    }

    setTabs((prev) => [...prev, fileTab])
    setActiveTab(newTabId)

    // Track this file in our current files list
    setCurrentFiles((prev) => {
      if (!prev.includes(path)) {
        return [...prev, path]
      }
      return prev
    })

    try {
      // Generate a session ID if needed
      const sessionId = localStorage.getItem("session_id") || Math.random().toString(36).substring(7)
      localStorage.setItem("session_id", sessionId)

      // Update the current repository context
      setCurrentRepo(repo)

      // Cleanup repo path if needed (e.g. "owner/repo/owner/repo" -> "owner/repo")
      const cleanRepoPath =
        repo.includes("/") && repo.split("/").length > 2 ? `${repo.split("/")[0]}/${repo.split("/")[1]}` : repo

      // Fetch the file content
      const encodedPath = encodeURIComponent(path)
      const response = await fetch(`/api/file/${sessionId}/${cleanRepoPath}/${encodedPath}`, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache",
        },
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Update the tab with the actual content
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === newTabId ? { ...tab, content: data.content || "File content unavailable" } : tab,
        ),
      )
    } catch (error) {
      console.error("Failed to load file:", error)

      // Update the tab with error message
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === newTabId
            ? {
                ...tab,
                content: `Error loading file content: ${error instanceof Error ? error.message : "Unknown error"}`,
              }
            : tab,
        ),
      )
    }
  }

  // Handle response from ChatInterface
  const handleChatResponse = (response: any) => {
    const actionType = response.action_type || "self_solve"

    // Handle different action types
    if (actionType === "search") {
      if (response.repositories) {
        setFileStructure(response.repositories)
        // Open the panel when repositories are loaded
        setIsPanelOpen(true)
      }
    } else if (["list_directory", "repo_tree", "clone"].includes(actionType)) {
      if (response.fileStructure) {
        setFileStructure(response.fileStructure)
        if (response.repoName) {
          setCurrentRepo(response.repoName)
          // When changing repos, reset the current files
          setCurrentFiles([])
          // Open the panel when file structure is loaded
          setIsPanelOpen(true)
        }
      }
    } else if (actionType === "read_file") {
      // Check if we already have this file open
      const existingTabId = tabs.find(
        (t) => t.type === "file" && t.repoName === response.repoName && t.path === response.filePath,
      )?.id

      if (existingTabId) {
        setActiveTab(existingTabId)
        setIsPanelOpen(true)
        return
      }

      // Create a new tab for this file
      if (response.filePath) {
        const newTabId = `file-${Date.now()}`
        const fileTab: Tab = {
          id: newTabId,
          title: response.filePath.split("/").pop() || response.filePath,
          type: "file",
          content: response.fileContent || "Loading...",
          repoName: response.repoName,
          path: response.filePath,
        }

        setTabs((prev) => [...prev, fileTab])
        setActiveTab(newTabId)
        setIsPanelOpen(true)

        // Track this file in our current files list
        setCurrentFiles((prev) => {
          if (!prev.includes(response.filePath)) {
            return [...prev, response.filePath]
          }
          return prev
        })

        // Update current repo if needed
        if (response.repoName && !currentRepo) {
          setCurrentRepo(response.repoName)
        }
      }
    } else if (actionType === "chart") {
      if (response.chartContent) {
        // Check if we already have this chart open
        const chartTitle = `Chart: ${response.repoName || "Repo"}`
        const existingTabId = tabs.find(
          (t) => t.type === "chart" && t.title === chartTitle && t.content === response.chartContent,
        )?.id

        if (existingTabId) {
          setActiveTab(existingTabId)
          setIsPanelOpen(true)
          return
        }

        const newTabId = `chart-${Date.now()}`
        const chartTab: Tab = {
          id: newTabId,
          title: chartTitle,
          type: "chart",
          content: response.chartContent,
        }

        setTabs((prev) => [...prev, chartTab])
        setActiveTab(newTabId)
        setIsPanelOpen(true)
      }
    }
  }

  // Close a tab
  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    // Find if this is a file tab that we need to remove from current files
    const tab = tabs.find((t) => t.id === tabId)
    if (tab?.type === "file" && tab.path) {
      setCurrentFiles((prev) => prev.filter((path) => path !== tab.path))
    }

    setTabs((prev) => prev.filter((tab) => tab.id !== tabId))

    // If we're closing the active tab, select another one if available
    if (activeTab === tabId) {
      const remainingTabs = tabs.filter((tab) => tab.id !== tabId)
      if (remainingTabs.length > 0) {
        setActiveTab(remainingTabs[remainingTabs.length - 1].id)
      } else {
        setActiveTab(null)
      }
    }
  }

  // Create a welcome tab on first load
  useEffect(() => {
    const welcomeTab: Tab = {
      id: "welcome",
      title: "Welcome",
      type: "file",
      content: "# Welcome to GitHub AI Assistant\n\nUse the chat interface to interact with repositories.",
    }

    setTabs([welcomeTab])
    setActiveTab("welcome")
  }, [])

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <div
        className={`flex-1 flex flex-col relative ${isPanelOpen && !isMobile ? "mr-[50%]" : ""}`}
        style={{
          transition: "margin-right 0.3s ease-in-out",
        }}
      >
        {/* Use the ChatInterface component for both states */}
        <ChatInterface
          onResponse={handleChatResponse}
          currentRepo={currentRepo}
          currentFiles={currentFiles}
          onMessagesChange={setHasMessages}
        />
      </div>

      {/* Repository Panel - Slides in from right */}
      <div
        className={`fixed top-0 right-0 h-full bg-background border-l border-border ${
          isPanelOpen ? "translate-x-0" : "translate-x-full"
        } transition-transform duration-300 ease-in-out ${isMobile ? "w-full" : "w-1/2"}`}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 left-2 z-10"
          onClick={() => setIsPanelOpen(false)}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>

        <RepositoryPanel
          repoName={currentRepo}
          fileStructure={fileStructure}
          tabs={tabs}
          activeTab={activeTab}
          onFileSelect={handleFileSelect}
          onTabChange={setActiveTab}
          onTabClose={handleCloseTab}
        />
      </div>

      {/* Toggle button for repository panel when closed */}
      {!isPanelOpen && fileStructure.length > 0 && (
        <Button variant="outline" size="icon" className="fixed top-4 right-4 z-10" onClick={() => setIsPanelOpen(true)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
      )}
    </div>
  )
}

