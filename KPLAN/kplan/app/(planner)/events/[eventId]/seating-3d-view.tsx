"use client"

import { useEffect, useRef, useState } from "react"

type SeatingTable = {
  id: string
  label: string
  shape: "round" | "rectangle" | "long"
  capacity: number
  pos_x: number
  pos_y: number
}

type GuestInfo = {
  id: string
  first_name: string
  last_name: string
}

type Assignment = {
  table_id: string
  guest_id: string
  seat_number: number | null
}

interface Seating3DViewProps {
  tables: SeatingTable[]
  assignments: Assignment[]
  allGuests: Map<string, GuestInfo>
  onClose: () => void
}

interface OrbitState {
  theta: number
  phi: number
  radius: number
  targetX: number
  targetY: number
  targetZ: number
}

interface MouseState {
  isDragging: boolean
  lastX: number
  lastY: number
  autoRotateTimer: NodeJS.Timeout | null
}

export default function Seating3DView({
  tables,
  assignments,
  allGuests,
  onClose,
}: Seating3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let disposed = false
    let animationFrameId: number | null = null
    let renderer: any = null
    let scene: any = null
    let camera: any = null
    const orbitState: OrbitState = {
      theta: Math.PI * 0.3,
      phi: Math.PI * 0.35,
      radius: 50,
      targetX: 0,
      targetY: 0,
      targetZ: 0,
    }
    const mouseState: MouseState = {
      isDragging: false,
      lastX: 0,
      lastY: 0,
      autoRotateTimer: null,
    }

    async function loadThreeJS(): Promise<any> {
      // Check if already loaded
      if ((window as any).THREE) return (window as any).THREE
      return new Promise((resolve, reject) => {
        const script = document.createElement("script")
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
        script.onload = () => resolve((window as any).THREE)
        script.onerror = () => reject(new Error("Failed to load Three.js"))
        document.head.appendChild(script)
      })
    }

    async function init() {
      if (disposed || !containerRef.current) return

      const THREE = await loadThreeJS()

      // Scene setup
      scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf5f7fa)
      scene.fog = new THREE.Fog(0xf5f7fa, 80, 100)

      // Camera setup
      camera = new THREE.PerspectiveCamera(
        75,
        containerRef.current.clientWidth / containerRef.current.clientHeight,
        0.1,
        1000
      )
      updateCameraPosition()

      // Renderer setup
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
      renderer.setSize(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight
      )
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowShadowMap
      containerRef.current.appendChild(renderer.domElement)

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
      scene.add(ambientLight)

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
      directionalLight.position.set(15, 25, 15)
      directionalLight.castShadow = true
      directionalLight.shadow.mapSize.width = 2048
      directionalLight.shadow.mapSize.height = 2048
      directionalLight.shadow.camera.left = -40
      directionalLight.shadow.camera.right = 40
      directionalLight.shadow.camera.top = 40
      directionalLight.shadow.camera.bottom = -40
      directionalLight.shadow.camera.near = 0.1
      directionalLight.shadow.camera.far = 100
      scene.add(directionalLight)

      // Ground plane
      const groundGeometry = new THREE.PlaneGeometry(50, 50)
      const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0xf0f0f0,
        roughness: 0.8,
        metalness: 0,
      })
      const ground = new THREE.Mesh(groundGeometry, groundMaterial)
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      scene.add(ground)

      // Render tables and chairs
      const tableObjects: any[] = []
      const chairObjects: any[] = []
      const labelSprites: any[] = []

      tables.forEach((table) => {
        const worldX = (table.pos_x / 100) * 40 - 20
        const worldZ = (table.pos_y / 100) * 40 - 20

        // Create table geometry
        const tableGroup = new THREE.Group()
        tableGroup.position.set(worldX, 0, worldZ)

        let tableGeometry: any
        let tableWidth: number
        let tableDepth: number

        if (table.shape === "round") {
          tableGeometry = new THREE.CylinderGeometry(1.5, 1.5, 0.15, 32)
          tableWidth = 3
          tableDepth = 3
        } else if (table.shape === "rectangle") {
          tableGeometry = new THREE.BoxGeometry(3, 0.15, 1.8)
          tableWidth = 3
          tableDepth = 1.8
        } else {
          // long
          tableGeometry = new THREE.BoxGeometry(4, 0.15, 1.2)
          tableWidth = 4
          tableDepth = 1.2
        }

        const tableMaterial = new THREE.MeshStandardMaterial({
          color: 0x8b6914,
          roughness: 0.5,
          metalness: 0.1,
        })
        const tableMesh = new THREE.Mesh(tableGeometry, tableMaterial)
        tableMesh.position.y = 0.075
        tableMesh.castShadow = true
        tableMesh.receiveShadow = true
        tableGroup.add(tableMesh)

        // Table legs
        const legGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.7, 16)
        const legMaterial = new THREE.MeshStandardMaterial({
          color: 0x6b4911,
          roughness: 0.6,
        })

        const legPositions = [
          [-tableWidth / 3, 0, -tableDepth / 3],
          [tableWidth / 3, 0, -tableDepth / 3],
          [-tableWidth / 3, 0, tableDepth / 3],
          [tableWidth / 3, 0, tableDepth / 3],
        ]

        legPositions.forEach(([x, _, z]) => {
          const leg = new THREE.Mesh(legGeometry, legMaterial)
          leg.position.set(x, 0.35, z)
          leg.castShadow = true
          tableGroup.add(leg)
        })

        scene.add(tableGroup)
        tableObjects.push({ mesh: tableGroup, table, worldX, worldZ, tableWidth, tableDepth })

        // Create chairs
        const assignedSeats = assignments.filter(
          (a) => a.table_id === table.id
        ).length
        const chairCount = table.capacity
        const chairRadius = Math.max(tableWidth, tableDepth) / 2 + 0.4

        for (let i = 0; i < chairCount; i++) {
          const angle = (i / chairCount) * Math.PI * 2
          const chairX = Math.cos(angle) * chairRadius
          const chairZ = Math.sin(angle) * chairRadius

          const chairGroup = new THREE.Group()
          chairGroup.position.set(worldX + chairX, 0.25, worldZ + chairZ)

          // Chair seat
          const seatGeometry = new THREE.BoxGeometry(0.3, 0.05, 0.3)
          const chairMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.7,
          })
          const seat = new THREE.Mesh(seatGeometry, chairMaterial)
          seat.castShadow = true
          seat.receiveShadow = true
          chairGroup.add(seat)

          // Chair back
          const backGeometry = new THREE.BoxGeometry(0.3, 0.4, 0.05)
          const back = new THREE.Mesh(backGeometry, chairMaterial)
          back.position.z = -0.15
          back.castShadow = true
          chairGroup.add(back)

          scene.add(chairGroup)
          chairObjects.push({
            mesh: chairGroup,
            tableId: table.id,
            seatNumber: i,
            worldX: worldX + chairX,
            worldY: 0.5,
            worldZ: worldZ + chairZ,
          })
        }

        // Table label sprite
        const tableLabel = createTextSprite(
          `${table.label}\n${assignedSeats}/${table.capacity}`,
          {
            color: assignedSeats >= table.capacity ? "#FFA500" : "#4CAF50",
            size: 24,
            background: true,
          }
        )
        tableLabel.position.set(worldX, 2, worldZ)
        scene.add(tableLabel)
        labelSprites.push(tableLabel)
      })

      // Add guest name labels
      assignments.forEach((assignment) => {
        const guest = allGuests.get(assignment.guest_id)
        if (!guest) return

        const chair = chairObjects.find(
          (c) => c.tableId === assignment.table_id && c.seatNumber === assignment.seat_number
        )
        if (!chair) return

        const nameLabel = createTextSprite(guest.first_name, {
          color: "#FFFFFF",
          size: 16,
          background: false,
        })
        nameLabel.position.set(chair.worldX, chair.worldY + 0.6, chair.worldZ)
        scene.add(nameLabel)
        labelSprites.push(nameLabel)
      })

      function updateCameraPosition() {
        const x =
          orbitState.targetX +
          orbitState.radius * Math.sin(orbitState.phi) * Math.cos(orbitState.theta)
        const y = orbitState.targetY + orbitState.radius * Math.cos(orbitState.phi)
        const z =
          orbitState.targetZ +
          orbitState.radius * Math.sin(orbitState.phi) * Math.sin(orbitState.theta)
        camera.position.set(x, y, z)
        camera.lookAt(orbitState.targetX, orbitState.targetY, orbitState.targetZ)
      }

      function createTextSprite(
        text: string,
        options: { color?: string; size?: number; background?: boolean }
      ) {
        const { color = "#FFFFFF", size = 24, background = false } = options

        const canvas = document.createElement("canvas")
        canvas.width = 512
        canvas.height = 512
        const ctx = canvas.getContext("2d")!
        ctx.fillStyle = background ? "rgba(0, 0, 0, 0.6)" : "transparent"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.fillStyle = color
        ctx.font = `${size}px Arial`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        const lines = text.split("\n")
        lines.forEach((line, i) => {
          const y = canvas.height / 2 + (i - (lines.length - 1) / 2) * (size + 10)
          ctx.fillText(line, canvas.width / 2, y)
        })

        const texture = new THREE.CanvasTexture(canvas)
        const material = new THREE.SpriteMaterial({ map: texture })
        const sprite = new THREE.Sprite(material)
        sprite.scale.set(2, 2, 1)

        return sprite
      }

      // Mouse event handlers
      function onMouseDown(event: MouseEvent) {
        mouseState.isDragging = true
        mouseState.lastX = event.clientX
        mouseState.lastY = event.clientY

        if (mouseState.autoRotateTimer) {
          clearTimeout(mouseState.autoRotateTimer)
          mouseState.autoRotateTimer = null
        }
      }

      function onMouseMove(event: MouseEvent) {
        if (!mouseState.isDragging) return

        const deltaX = event.clientX - mouseState.lastX
        const deltaY = event.clientY - mouseState.lastY

        orbitState.theta -= deltaX * 0.01
        orbitState.phi -= deltaY * 0.01

        orbitState.phi = Math.max(0.1, Math.min(Math.PI / 2.2, orbitState.phi))

        updateCameraPosition()

        mouseState.lastX = event.clientX
        mouseState.lastY = event.clientY
      }

      function onMouseUp() {
        mouseState.isDragging = false
        if (mouseState.autoRotateTimer) {
          clearTimeout(mouseState.autoRotateTimer)
        }
        mouseState.autoRotateTimer = setTimeout(() => {
          mouseState.autoRotateTimer = null
        }, 2000)
      }

      function onWheel(event: WheelEvent) {
        event.preventDefault()
        const delta = event.deltaY > 0 ? 1.1 : 0.9
        orbitState.radius *= delta
        orbitState.radius = Math.max(5, Math.min(60, orbitState.radius))
        updateCameraPosition()
      }

      renderer.domElement.addEventListener("mousedown", onMouseDown)
      renderer.domElement.addEventListener("mousemove", onMouseMove)
      renderer.domElement.addEventListener("mouseup", onMouseUp)
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false })

      // Handle window resize
      function onWindowResize() {
        if (!containerRef.current) return
        const width = containerRef.current.clientWidth
        const height = containerRef.current.clientHeight
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height)
      }
      window.addEventListener("resize", onWindowResize)

      // Animation loop
      function animate() {
        if (disposed) return

        animationFrameId = requestAnimationFrame(animate)

        // Auto-rotate when not dragging
        if (!mouseState.isDragging && !mouseState.autoRotateTimer) {
          orbitState.theta += 0.001
        }

        // Make labels face camera
        labelSprites.forEach((sprite) => {
          sprite.position.copy(sprite.position)
        })

        renderer.render(scene, camera)
      }

      animate()
      setLoading(false)

      // Cleanup function
      return () => {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId)
        }
        renderer.domElement.removeEventListener("mousedown", onMouseDown)
        renderer.domElement.removeEventListener("mousemove", onMouseMove)
        renderer.domElement.removeEventListener("mouseup", onMouseUp)
        renderer.domElement.removeEventListener("wheel", onWheel)
        window.removeEventListener("resize", onWindowResize)
        renderer.dispose()
        scene.clear()
        if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
          containerRef.current.removeChild(renderer.domElement)
        }
      }
    }

    init()

    return () => {
      disposed = true
    }
  }, [tables, assignments, allGuests])

  const totalAssignments = assignments.length
  const placedGuests = assignments.filter((a) => a.guest_id).length

  return (
    <div className="relative w-full bg-white">
      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
          <div className="text-lg font-semibold text-gray-700">
            Chargement 3D...
          </div>
        </div>
      )}

      {/* Canvas container */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          minHeight: "600px",
        }}
      />

      {/* Top-left: Back button */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors z-20"
      >
        ← Retour vue 2D
      </button>

      {/* Top-right: Legend */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-md p-4 max-w-xs z-20">
        <h3 className="font-semibold text-gray-800 mb-3">Légende</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: "#8B6914" }}
            />
            <span className="text-gray-700">Tables</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: "#444444" }}
            />
            <span className="text-gray-700">Chaises</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: "#4CAF50" }}
            />
            <span className="text-gray-700">Espace disponible</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: "#FFA500" }}
            />
            <span className="text-gray-700">Table pleine</span>
          </div>
        </div>
      </div>

      {/* Bottom: Stats bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gray-800 text-white py-3 px-4 flex justify-between items-center shadow-md z-20">
        <div className="text-sm font-medium">
          {tables.length} table{tables.length !== 1 ? "s" : ""} • {placedGuests}{" "}
          invité{placedGuests !== 1 ? "s" : ""} placé{placedGuests !== 1 ? "s" : ""}
        </div>
        <div className="text-xs text-gray-400">
          Souris: rotation | Molette: zoom
        </div>
      </div>
    </div>
  )
}
