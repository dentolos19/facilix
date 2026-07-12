import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "#/components/ui/sidebar"

const data = {
  name: "Facilix",
  navMain: [
    {
      title: "Overview",
      url: "#",
    },
    {
      title: "Security",
      url: "#",
      items: [
        {
          title: "Facility Panel",
          url: "#",
        },
        {
          title: "Alerts",
          url: "#",
        },
      ],
    },
    {
      title: "Environment",
      url: "#",
    },
    {
      title: "Logistics",
      url: "#",
    },
    {
      title: "Compliance",
      url: "#",
    },
    {
      title: "Personnel",
      url: "#",
    },
    {
      title: "Settings",
      url: "#",
    },
  ],
}

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <h1 className="px-4 py-2 text-lg font-bold">{data.name}</h1>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {data.navMain.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <a className="px-8 py-4 text-lg" href={item.url}>{item.title}</a>
              </SidebarMenuButton>

              {item.items && (
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {item.items.map((subItem) => (
                        <SidebarMenuItem key={subItem.title}>
                          <SidebarMenuButton asChild>
                            <a className="px-8 py-4 text-lg" href={subItem.url}>
                              {subItem.title}
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}